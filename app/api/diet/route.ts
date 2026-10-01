import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, jsonBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { replaceMealFood } from "@/services/tracking-service";
const replaceSchema=z.object({mealFoodId:z.string().min(1),foodId:z.string().min(1),quantity:z.number().positive().max(10000)});
export async function GET(){
  try {
    const user=await requireUser();
    const plans=await prisma.mealPlan.findMany({where:{userId:user.id},orderBy:{version:"desc"},take:10,include:{meals:{orderBy:{scheduledAt:"asc"},include:{foods:{include:{food:true}}}}}});
    return NextResponse.json({plans,active:plans[0]??null});
  }catch(error){return apiError(error);}
}
export async function PUT(request:Request){try{const user=await requireUser();const input=replaceSchema.parse(await jsonBody(request));return NextResponse.json(await replaceMealFood(user.id,input.mealFoodId,input.foodId,input.quantity));}catch(error){return apiError(error);}}
