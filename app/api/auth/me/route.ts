import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
export async function GET() { try { const user = await getSessionUser(); return user ? NextResponse.json({ user: { id: user.id, email: user.email }, profile: user.profile }) : NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Please log in." } }, { status: 401 }); } catch (error) { return apiError(error); } }
