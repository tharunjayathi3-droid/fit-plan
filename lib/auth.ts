import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { FitPlanError } from "@/lib/errors";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "fitplan_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}
export async function verifyPassword(password: string, saved: string) {
  const [scheme, salt, hash] = saved.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const digestSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({ data: { userId, tokenHash: digestSessionToken(token), expiresAt } });
  return { token, expiresAt };
}
export async function revokeSession(token?: string | null) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: digestSessionToken(token) } });
}
export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: digestSessionToken(token) }, include: { user: { include: { profile: true } } } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) { await revokeSession(token); return null; }
  return session.user;
}
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new FitPlanError("UNAUTHORIZED", "Please log in to continue.", 401);
  return user;
}
