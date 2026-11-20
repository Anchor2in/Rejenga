import { describe, expect, it } from "vitest";
import {
  createEmailVerificationCode, hashEmailVerificationCode, matchesEmailVerificationCode,
} from "./emailVerification";

describe("email verification codes", () => {
  it("generates six-digit numeric codes", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(createEmailVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it("only matches the code for the account and secret it was created for", () => {
    const userId = "user-1";
    const code = "048219";
    const secret = "test-secret";
    const hash = hashEmailVerificationCode(userId, code, secret);

    expect(matchesEmailVerificationCode(userId, code, hash, secret)).toBe(true);
    expect(matchesEmailVerificationCode("user-2", code, hash, secret)).toBe(false);
    expect(matchesEmailVerificationCode(userId, "048218", hash, secret)).toBe(false);
    expect(matchesEmailVerificationCode(userId, code, hash, "different-secret")).toBe(false);
  });
});
