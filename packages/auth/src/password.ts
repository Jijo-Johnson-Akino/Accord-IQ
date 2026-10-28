import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 };

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, SCRYPT_OPTIONS, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  const [saltHex, keyHex] = data.hash.split(":");
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (expected.length === 0) return false;
  const actual = await scryptAsync(data.password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
