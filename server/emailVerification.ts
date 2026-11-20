import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
export const EMAIL_CODE_RESEND_DELAY_MS = 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export function createEmailVerificationCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function hashEmailVerificationCode(userId: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`${userId}:${code}`).digest("hex");
}

export function matchesEmailVerificationCode(userId: string, code: string, hash: string, secret: string): boolean {
  const expected = Buffer.from(hashEmailVerificationCode(userId, code, secret), "hex");
  const actual = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
