import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { apiError, jsonBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { FitPlanError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
const dummyHashPromise = hashPassword("dummy-password-for-timing");
export async function POST(request: Request) {
  try {
    rateLimit(`login:${request.headers.get("x-forwarded-for") ?? "unknown"}`, 10);
    const input = schema.parse(await jsonBody(request));
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    const valid = await verifyPassword(input.password, user?.passwordHash ?? await dummyHashPromise);
    if (!user || !valid) throw new FitPlanError("UNAUTHORIZED", "Email or password is incorrect.", 401);
    const session = await createSession(user.id);
    const response = NextResponse.json({ user: { id: user.id, email: user.email }, needsProfile: !(await prisma.profile.findUnique({ where: { userId: user.id }, select: { id: true } })) });
    response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: session.expiresAt });
    return response;
  } catch (error) { return apiError(error); }
}
