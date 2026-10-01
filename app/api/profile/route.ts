import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError, jsonBody } from "@/lib/api";
import { getProfile, updateProfile } from "@/services/profile-service";
export async function GET() { try { const user = await requireUser(); return NextResponse.json({ profile: await getProfile(user.id) }); } catch (error) { return apiError(error); } }
export async function PUT(request: Request) { try { const user = await requireUser(); return NextResponse.json({ profile: await updateProfile(user.id, await jsonBody(request)) }); } catch (error) { return apiError(error); } }
