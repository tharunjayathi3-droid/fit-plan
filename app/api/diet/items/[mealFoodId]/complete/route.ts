import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { FitPlanError } from "@/lib/errors";
export async function POST(_request:Request,context:{params:Promise<{mealFoodId:string}>}){try{const user=await requireUser();const {mealFoodId}=await context.params;const item=await prisma.mealFood.findFirst({where:{id:mealFoodId,meal:{mealPlan:{userId:user.id}}},select:{id:true,isCompleted:true}});if(!item)throw new FitPlanError("NOT_FOUND","Meal item was not found.",404);const updated=await prisma.mealFood.update({where:{id:item.id},data:{isCompleted:!item.isCompleted}});return NextResponse.json({isCompleted:updated.isCompleted});}catch(error){return apiError(error);}}
