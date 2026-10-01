import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword, SESSION_COOKIE } from "@/lib/auth";
import { apiError, jsonBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { FitPlanError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(10).max(128), name: z.string().trim().min(1).max(120).optional() });
export async function POST(request: Request) {
  try {
    rateLimit(`register:${request.headers.get("x-forwarded-for") ?? "unknown"}`, 5);
    const input = schema.parse(await jsonBody(request));
    const email = input.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new FitPlanError("VALIDATION_ERROR", "An account with this email already exists.", 409);
    const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(input.password), profile: input.name ? { create: { name: input.name } } : undefined }, select: { id: true, email: true } });
    const session = await createSession(user.id);
    const response = NextResponse.json({ user, needsProfile: !input.name });
    response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: session.expiresAt });
    return response;
  } catch (error) { return apiError(error); }
}
