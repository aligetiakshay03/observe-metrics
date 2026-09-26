import bcrypt from "bcryptjs";
import { z } from "zod";

const COST = 12;

// Real bcrypt hash (same cost) compared against when the account does not
// exist, so response time doesn't reveal which emails are registered.
let dummyHash: string | null = null;
async function getDummyHash() {
  dummyHash ??= await bcrypt.hash("om-timing-equalizer", COST);
  return dummyHash;
}

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Password is too long.")
  .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), "Include at least one letter and one number.");

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, await getDummyHash());
    return false;
  }
  return bcrypt.compare(password, hash);
}
