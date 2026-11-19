import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { config } from "./config";
import { db, schema } from "./db";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const uploadPath = (fileName: string) => path.join(config.uploadDir, path.basename(fileName));

export async function saveUpload(file: File) {
  const ext = EXT[file.type];
  if (!ext) throw new Error("Photos must be JPEG, PNG or WebP images.");
  if (file.size > config.maxPhotoBytes) throw new Error("Each photo must be 5 MB or smaller.");
  await fs.mkdir(config.uploadDir, { recursive: true });
  const fileName = `${randomUUID()}.${ext}`;
  await fs.writeFile(uploadPath(fileName), Buffer.from(await file.arrayBuffer()));
  return { fileName, mimeType: file.type, sizeBytes: file.size };
}

/** Runs the advisory AI check for one photo and stores the result. Never throws. */
export async function runPhotoCheck(photoId: number) {
  const { listingPhotos } = schema;
  if (!config.aiEnabled) {
    await db.update(listingPhotos).set({ aiStatus: "disabled" }).where(eq(listingPhotos.id, photoId));
    return;
  }
  try {
    const [photo] = await db.select().from(listingPhotos).where(eq(listingPhotos.id, photoId));
    if (!photo) return;
    const models = await db
      .select({ brand: schema.deviceModels.brand, name: schema.deviceModels.modelName })
      .from(schema.deviceModels)
      .where(eq(schema.deviceModels.active, true));
    const { classifyPhoto } = await import("./ai/classifier");
    const p = await classifyPhoto(uploadPath(photo.fileName), models.map((m) => `${m.brand} ${m.name}`));
    await db
      .update(listingPhotos)
      .set({
        aiStatus: "done",
        aiModelLabel: p.modelLabel,
        aiModelConfidence: p.modelConfidence,
        aiDamageLabel: p.damageLabel,
        aiDamageConfidence: p.damageConfidence,
        aiLowConfidence: Math.min(p.modelConfidence, p.damageConfidence) < config.aiLowConfidence,
        aiEngine: p.engine,
        aiError: null,
      })
      .where(eq(listingPhotos.id, photoId));
  } catch (e) {
    console.error("AI photo check failed", e);
    await db
      .update(listingPhotos)
      .set({ aiStatus: "failed", aiError: e instanceof Error ? e.message.slice(0, 500) : "Unknown error" })
      .where(eq(listingPhotos.id, photoId));
  }
}
