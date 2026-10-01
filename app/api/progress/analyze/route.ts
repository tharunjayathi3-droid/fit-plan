import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { analyzeProgress } from "@/services/progress-analysis-service";
export async function GET(){try{const user=await requireUser();return NextResponse.json(await analyzeProgress(user.id));}catch(error){return apiError(error);}}
export async function POST(){try{const user=await requireUser();const {generateUpdatedPlan}=await import("@/services/progress-analysis-service");return NextResponse.json(await generateUpdatedPlan(user.id),{status:201});}catch(error){return apiError(error);}}
