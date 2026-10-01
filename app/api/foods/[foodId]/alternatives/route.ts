import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, jsonBody } from "@/lib/api";
import { findFoodAlternatives } from "@/services/food-alternative-service";
const schema=z.object({quantity:z.number().positive().optional(),useAvailableFoods:z.boolean().default(false)});
export async function POST(request:Request,context:{params:Promise<{foodId:string}>}){try{const user=await requireUser();const {foodId}=await context.params;const input=schema.parse(await jsonBody(request));let available:string[]|undefined;if(input.useAvailableFoods){const {prisma}=await import("@/lib/prisma");available=(await prisma.userAvailableFood.findMany({where:{userId:user.id},select:{foodId:true}})).map((food)=>food.foodId);}const result=await findFoodAlternatives(foodId,user.id,available,input.quantity);return NextResponse.json(result);}catch(error){return apiError(error);}}
