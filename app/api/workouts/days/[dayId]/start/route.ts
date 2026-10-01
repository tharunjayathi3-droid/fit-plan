import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { startWorkout } from "@/services/tracking-service";
export async function POST(_request:Request,context:{params:Promise<{dayId:string}>}){try{const user=await requireUser();const {dayId}=await context.params;return NextResponse.json(await startWorkout(user.id,dayId));}catch(error){return apiError(error);}}
