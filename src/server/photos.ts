import { asc, eq } from "drizzle-orm";
import { db, schema } from "./db";

export async function loadPhotos(listingId: number) {
  return db.select().from(schema.listingPhotos).where(eq(schema.listingPhotos.listingId, listingId)).orderBy(asc(schema.listingPhotos.id));
}
