import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { startExercise } from "@/services/tracking-service";
export async function POST(_request:Request,context:{params:Promise<{workoutExerciseId:string}>}){try{const user=await requireUser();const {workoutExerciseId}=await context.params;return NextResponse.json(await startExercise(user.id,workoutExerciseId));}catch(error){return apiError(error);}}
