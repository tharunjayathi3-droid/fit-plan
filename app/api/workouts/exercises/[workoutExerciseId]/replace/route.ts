import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, jsonBody } from "@/lib/api";
import { replaceWorkoutExercise } from "@/services/tracking-service";
const schema=z.object({exerciseId:z.string().min(1)});
export async function PUT(request:Request,context:{params:Promise<{workoutExerciseId:string}>}){try{const user=await requireUser();const {workoutExerciseId}=await context.params;const input=schema.parse(await jsonBody(request));return NextResponse.json(await replaceWorkoutExercise(user.id,workoutExerciseId,input.exerciseId));}catch(error){return apiError(error);}}
