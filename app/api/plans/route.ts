import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { generateDietPlan } from "@/services/diet-generation-service";
import { generateWorkoutPlan } from "@/services/workout-generation-service";
export async function GET() {
  try {
    const user=await requireUser();
    const [diet,workout]=await Promise.all([
      prisma.mealPlan.findFirst({where:{userId:user.id},orderBy:{version:"desc"},include:{meals:{include:{foods:{include:{food:true}}}}}}),
      prisma.workoutPlan.findFirst({where:{userId:user.id},orderBy:{version:"desc"},include:{days:{include:{exercises:{include:{exercise:{include:{equipment:{include:{equipment:true}}}},sets:true}}}}}}),
    ]);
    return NextResponse.json({diet,workout});
  }catch(error){return apiError(error);}
}
export async function POST() {
  let userId:string|undefined;let dietId:string|undefined;let workoutId:string|undefined;
  try {
    const user=await requireUser();userId=user.id;
    const diet=await generateDietPlan(user.id);dietId=diet.plan.id;
    const workout=await generateWorkoutPlan(user.id);workoutId=workout.plan.id;
    return NextResponse.json({diet,workout}, {status:201});
  } catch(error) {
    // Compensate if the second plan fails: both plan trees are removed together.
    if(userId&&(dietId||workoutId))await prisma.$transaction(async(tx)=>{if(dietId)await tx.mealPlan.deleteMany({where:{id:dietId,userId}});if(workoutId)await tx.workoutPlan.deleteMany({where:{id:workoutId,userId}});});
    return apiError(error);
  }
}
