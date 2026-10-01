import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { findExerciseAlternatives } from "@/services/exercise-alternative-service";
export async function GET(_request:Request,context:{params:Promise<{exerciseId:string}>}){try{const user=await requireUser();const {exerciseId}=await context.params;return NextResponse.json(await findExerciseAlternatives(exerciseId,user.id));}catch(error){return apiError(error);}}
