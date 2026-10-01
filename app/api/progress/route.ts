import { NextResponse } from "next/server";
import { ProgressMetric } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, jsonBody } from "@/lib/api";
import { getProgressSummary, recordProgress } from "@/services/tracking-service";
const schema=z.object({metric:z.nativeEnum(ProgressMetric),value:z.number().positive().max(100000),unit:z.string().trim().min(1).max(24),recordedAt:z.string().datetime().optional(),notes:z.string().max(1000).optional()});
export async function GET(){try{const user=await requireUser();return NextResponse.json(await getProgressSummary(user.id));}catch(error){return apiError(error);}}
export async function POST(request:Request){try{const user=await requireUser();const input=schema.parse(await jsonBody(request));const entry=await recordProgress(user.id,{...input,recordedAt:input.recordedAt?new Date(input.recordedAt):undefined});return NextResponse.json({entry},{status:201});}catch(error){return apiError(error);}}
