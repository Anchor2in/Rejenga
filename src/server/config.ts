import path from "node:path";

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? "./uploads"),
  requireAccountApproval: process.env.REQUIRE_ACCOUNT_APPROVAL !== "false",
  reservationDays: num(process.env.RESERVATION_DAYS, 7),
  aiLowConfidence: num(process.env.AI_LOW_CONFIDENCE, 0.5),
  aiEnabled: process.env.AI_ENABLED !== "false",
  maxPhotoBytes: 5 * 1024 * 1024,
  maxPhotosPerListing: 4,
  sessionDays: 30,
};
