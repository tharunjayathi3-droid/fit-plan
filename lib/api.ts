import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { FitPlanError, publicError } from "@/lib/errors";

export function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ") } }, { status: 400 });
  if (error instanceof FitPlanError) return NextResponse.json(publicError(error).body, { status: error.status });
  console.error("FitPlan API error", error);
  return NextResponse.json({ error: { code: "DATABASE_ERROR", message: "Something went wrong. Please try again." } }, { status: 500 });
}

export async function jsonBody(request: Request) {
  try { return await request.json(); } catch { throw new FitPlanError("VALIDATION_ERROR", "Request body must be valid JSON."); }
}
