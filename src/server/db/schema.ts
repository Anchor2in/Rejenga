import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["community", "technician", "admin"]);
export const userStatus = pgEnum("user_status", ["pending", "active", "suspended"]);
export const listingStatus = pgEnum("listing_status", ["active", "withdrawn", "removed", "closed"]);
export const donorCondition = pgEnum("donor_condition", ["working", "unsure", "not_working"]);
export const inspectionStatus = pgEnum("inspection_status", ["not_inspected", "checked", "rejected", "blocked_unsafe"]);
export const partAvailability = pgEnum("part_availability", ["available", "reserved", "handed_over", "withdrawn"]);
export const aiStatus = pgEnum("ai_status", ["pending", "done", "failed", "disabled"]);
export const requestStatus = pgEnum("request_status", ["open", "reserved", "fulfilled", "cancelled"]);
export const matchStatus = pgEnum("match_status", [
  "reserved",
  "accepted",
  "rejected",
  "blocked_unsafe",
  "completed",
  "declined",
  "cancelled",
  "expired",
]);
export const inspectionFit = pgEnum("inspection_fit", ["fits", "does_not_fit", "uncertain"]);
export const inspectionDecision = pgEnum("inspection_decision", ["accepted", "rejected", "unsafe"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const areas = pgTable("areas", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  town: text("town").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  active: boolean("active").notNull().default(true),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("community"),
  status: userStatus("status").notNull().default("pending"),
  areaId: integer("area_id").references(() => areas.id),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const deviceModels = pgTable(
  "device_models",
  {
    id: serial("id").primaryKey(),
    brand: text("brand").notNull(),
    modelName: text("model_name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("device_models_brand_model_uq").on(t.brand, t.modelName)],
);

export const partTypes = pgTable("part_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isBattery: boolean("is_battery").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const compatibilityRules = pgTable(
  "compatibility_rules",
  {
    id: serial("id").primaryKey(),
    donorModelId: integer("donor_model_id")
      .notNull()
      .references(() => deviceModels.id),
    recipientModelId: integer("recipient_model_id")
      .notNull()
      .references(() => deviceModels.id),
    partTypeId: integer("part_type_id")
      .notNull()
      .references(() => partTypes.id),
    active: boolean("active").notNull().default(true),
    source: text("source").notNull(),
    notes: text("notes"),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("compat_rule_uq").on(t.donorModelId, t.recipientModelId, t.partTypeId)],
);

export const deviceListings = pgTable(
  "device_listings",
  {
    id: serial("id").primaryKey(),
    donorId: integer("donor_id")
      .notNull()
      .references(() => users.id),
    modelId: integer("model_id")
      .notNull()
      .references(() => deviceModels.id),
    areaId: integer("area_id")
      .notNull()
      .references(() => areas.id),
    visibleCondition: text("visible_condition").notNull(),
    description: text("description"),
    status: listingStatus("status").notNull().default("active"),
    removedReason: text("removed_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("listings_donor_idx").on(t.donorId)],
);

export const listingParts = pgTable(
  "listing_parts",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => deviceListings.id, { onDelete: "cascade" }),
    partTypeId: integer("part_type_id")
      .notNull()
      .references(() => partTypes.id),
    donorCondition: donorCondition("donor_condition").notNull().default("unsure"),
    donorNotes: text("donor_notes"),
    inspectionStatus: inspectionStatus("inspection_status").notNull().default("not_inspected"),
    availability: partAvailability("availability").notNull().default("available"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("listing_part_type_uq").on(t.listingId, t.partTypeId)],
);

export const listingPhotos = pgTable("listing_photos", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => deviceListings.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  aiStatus: aiStatus("ai_status").notNull().default("pending"),
  aiModelLabel: text("ai_model_label"),
  aiModelConfidence: real("ai_model_confidence"),
  aiDamageLabel: text("ai_damage_label"),
  aiDamageConfidence: real("ai_damage_confidence"),
  aiLowConfidence: boolean("ai_low_confidence"),
  aiEngine: text("ai_engine"),
  aiError: text("ai_error"),
  createdAt: createdAt(),
});

export const partRequests = pgTable(
  "part_requests",
  {
    id: serial("id").primaryKey(),
    recipientId: integer("recipient_id")
      .notNull()
      .references(() => users.id),
    modelId: integer("model_id")
      .notNull()
      .references(() => deviceModels.id),
    partTypeId: integer("part_type_id")
      .notNull()
      .references(() => partTypes.id),
    areaId: integer("area_id")
      .notNull()
      .references(() => areas.id),
    problem: text("problem").notNull(),
    status: requestStatus("status").notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [index("requests_recipient_idx").on(t.recipientId)],
);

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    listingPartId: integer("listing_part_id")
      .notNull()
      .references(() => listingParts.id),
    requestId: integer("request_id")
      .notNull()
      .references(() => partRequests.id),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => compatibilityRules.id),
    status: matchStatus("status").notNull().default("reserved"),
    reason: text("reason").notNull(),
    distanceKm: real("distance_km"),
    inspectionStatusAtMatch: inspectionStatus("inspection_status_at_match").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedById: integer("closed_by_id").references(() => users.id),
    outcomeNote: text("outcome_note"),
  },
  (t) => [
    uniqueIndex("one_open_match_per_part")
      .on(t.listingPartId)
      .where(sql`${t.status} in ('reserved', 'accepted')`),
    uniqueIndex("one_open_match_per_request")
      .on(t.requestId)
      .where(sql`${t.status} in ('reserved', 'accepted')`),
  ],
);

export const inspections = pgTable("inspections", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .unique()
    .references(() => matches.id),
  technicianId: integer("technician_id")
    .notNull()
    .references(() => users.id),
  inspectedAt: timestamp("inspected_at", { withTimezone: true }).notNull().defaultNow(),
  observedCondition: text("observed_condition").notNull(),
  fit: inspectionFit("fit").notNull(),
  decision: inspectionDecision("decision").notNull(),
  notes: text("notes"),
});

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);
