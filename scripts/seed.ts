import "dotenv/config";
import bcrypt from "bcryptjs";
import { count } from "drizzle-orm";
import { db, schema } from "../src/server/db";

const { areas, users, deviceModels, partTypes, compatibilityRules, deviceListings, listingParts, partRequests } = schema;

// Rough area centres around MKU Thika. Only used to estimate distance between areas.
const AREAS = [
  { name: "MKU Main Campus", town: "Thika", lat: -1.0446, lng: 37.0835 },
  { name: "Thika CBD", town: "Thika", lat: -1.0388, lng: 37.0834 },
  { name: "Section 9", town: "Thika", lat: -1.048, lng: 37.076 },
  { name: "Makongeni", town: "Thika", lat: -1.056, lng: 37.11 },
  { name: "Landless", town: "Thika", lat: -1.025, lng: 37.07 },
  { name: "Ngoingwa", town: "Thika", lat: -1.02, lng: 37.09 },
  { name: "Kiganjo", town: "Thika", lat: -1.03, lng: 37.06 },
  { name: "Juja", town: "Juja", lat: -1.102, lng: 37.014 },
  { name: "Ruiru", town: "Ruiru", lat: -1.146, lng: 36.96 },
];

const MODELS: [string, string][] = [
  ["Tecno", "Spark 10"],
  ["Tecno", "Spark 10 Pro"],
  ["Tecno", "Camon 20"],
  ["Infinix", "Hot 30"],
  ["Infinix", "Hot 30i"],
  ["Infinix", "Smart 7"],
  ["Samsung", "Galaxy A14"],
  ["Samsung", "Galaxy A04s"],
  ["itel", "A70"],
  ["itel", "S23"],
];

const PARTS = [
  { name: "Screen (display assembly)", isBattery: false },
  { name: "Battery", isBattery: true },
  { name: "Back cover", isBattery: false },
  { name: "Charging port board", isBattery: false },
  { name: "Rear camera", isBattery: false },
  { name: "Front camera", isBattery: false },
  { name: "Loudspeaker", isBattery: false },
];

// Cross-model pairs used only to demonstrate cross-model matching. They are NOT verified
// compatibility facts and are clearly labelled; replace them with technician-confirmed rules.
const DEMO_CROSS: [string, string, string][] = [
  ["Tecno Spark 10 Pro", "Tecno Spark 10", "Back cover"],
  ["Infinix Hot 30i", "Infinix Hot 30", "Loudspeaker"],
];

async function main() {
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) {
    console.log("Database already has users — skipping seed. Run `npm run db:reset` to start fresh.");
    return;
  }
  const demoPassword = process.env.SEED_PASSWORD ?? "rejenga123";
  const hash = await bcrypt.hash(demoPassword, 10);

  const areaRows = await db.insert(areas).values(AREAS).returning();
  const area = (name: string) => areaRows.find((a) => a.name === name)!.id;
  const modelRows = await db.insert(deviceModels).values(MODELS.map(([brand, modelName]) => ({ brand, modelName }))).returning();
  const model = (label: string) => modelRows.find((m) => `${m.brand} ${m.modelName}` === label)!.id;
  const partRows = await db.insert(partTypes).values(PARTS).returning();
  const part = (name: string) => partRows.find((p) => p.name === name)!.id;

  const [admin, , amina, kevin, brian] = await db
    .insert(users)
    .values([
      { name: "ReJenga Admin", email: "admin@rejenga.local", passwordHash: hash, role: "admin", status: "active", areaId: area("MKU Main Campus") },
      { name: "Joseph Mwangi", email: "tech@rejenga.local", phone: "0700 000 001", passwordHash: hash, role: "technician", status: "active", areaId: area("Thika CBD") },
      { name: "Amina Wanjiru", email: "donor@rejenga.local", phone: "0700 000 002", passwordHash: hash, role: "community", status: "active", areaId: area("Section 9") },
      { name: "Kevin Otieno", email: "kevin@rejenga.local", phone: "0700 000 003", passwordHash: hash, role: "community", status: "active", areaId: area("Juja") },
      { name: "Brian Kamau", email: "recipient@rejenga.local", phone: "0700 000 004", passwordHash: hash, role: "community", status: "active", areaId: area("MKU Main Campus") },
      { name: "Faith Njeri", email: "pending@rejenga.local", passwordHash: hash, role: "technician", status: "pending", areaId: area("Makongeni") },
    ])
    .returning();

  await db.insert(compatibilityRules).values([
    ...modelRows.flatMap((m) =>
      partRows.map((p) => ({ donorModelId: m.id, recipientModelId: m.id, partTypeId: p.id, source: "Same model (default rule)", createdById: admin.id })),
    ),
    ...DEMO_CROSS.flatMap(([d, r, p]) => [
      { donorModelId: model(d), recipientModelId: model(r), partTypeId: part(p), source: "Demo rule — not verified", notes: "Sample data. Confirm with a technician before the pilot.", createdById: admin.id },
    ]),
  ]);

  const [l1, l2, l3] = await db
    .insert(deviceListings)
    .values([
      { donorId: amina.id, modelId: model("Tecno Spark 10"), areaId: area("Section 9"), visibleCondition: "Back glass cracked in one corner. Screen has no cracks. Phone stopped charging.", description: "Unused for 4 months." },
      { donorId: kevin.id, modelId: model("Tecno Spark 10"), areaId: area("Juja"), visibleCondition: "Water damage — phone won't turn on. No visible cracks.", description: null },
      { donorId: kevin.id, modelId: model("Tecno Spark 10 Pro"), areaId: area("Juja"), visibleCondition: "Screen shattered, frame dented on the left.", description: null },
    ])
    .returning();
  await db.insert(listingParts).values([
    { listingId: l1.id, partTypeId: part("Screen (display assembly)"), donorCondition: "working" },
    { listingId: l1.id, partTypeId: part("Rear camera"), donorCondition: "working" },
    { listingId: l1.id, partTypeId: part("Battery"), donorCondition: "unsure", donorNotes: "Looks flat, not swollen." },
    { listingId: l2.id, partTypeId: part("Screen (display assembly)"), donorCondition: "unsure" },
    { listingId: l2.id, partTypeId: part("Loudspeaker"), donorCondition: "unsure" },
    { listingId: l3.id, partTypeId: part("Back cover"), donorCondition: "working" },
    { listingId: l3.id, partTypeId: part("Front camera"), donorCondition: "working" },
  ]);
  await db.insert(partRequests).values([
    { recipientId: brian.id, modelId: model("Tecno Spark 10"), partTypeId: part("Screen (display assembly)"), areaId: area("MKU Main Campus"), problem: "Screen cracked after a fall; touch doesn't work on the top half." },
  ]);

  console.log(`Seeded. Demo accounts (password "${demoPassword}"): admin@, tech@, donor@, kevin@, recipient@, pending@rejenga.local`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
