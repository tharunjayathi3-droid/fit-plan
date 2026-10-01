import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, jsonBody } from "@/lib/api";
import { completeSet } from "@/services/tracking-service";
const schema=z.object({reps:z.number().int().min(1).max(1000),weightKg:z.number().min(0).max(2000).optional()});
export async function POST(request:Request,context:{params:Promise<{setId:string}>}){try{const user=await requireUser();const {setId}=await context.params;const input=schema.parse(await jsonBody(request));return NextResponse.json(await completeSet(user.id,setId,input));}catch(error){return apiError(error);}}
