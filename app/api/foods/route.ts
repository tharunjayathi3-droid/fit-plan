import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { foodRepository } from "@/services/food-service";
export async function GET(request:Request){try{await requireUser();const params=new URL(request.url).searchParams;const query=params.get("q")??"";const category=params.get("category");const results=category?await foodRepository.getFoodsByCategory(category as never):await foodRepository.searchFoods(query);return NextResponse.json({foods:results});}catch(error){return apiError(error);}}
const availableSchema=z.object({foods:z.array(z.object({foodId:z.string().min(1),quantity:z.number().positive().optional(),unit:z.string().max(24).optional()})).max(200)});
export async function PUT(request:Request){try{const user=await requireUser();const input=availableSchema.parse(await request.json());const {prisma}=await import("@/lib/prisma");const ids=input.foods.map((food)=>food.foodId);const valid=await prisma.food.count({where:{id:{in:ids}}});if(valid!==new Set(ids).size)return NextResponse.json({error:{code:"VALIDATION_ERROR",message:"One or more foods do not exist."}},{status:400});await prisma.$transaction([prisma.userAvailableFood.deleteMany({where:{userId:user.id}}),...(input.foods.length?[prisma.userAvailableFood.createMany({data:input.foods.map((food)=>({userId:user.id,foodId:food.foodId,quantity:food.quantity,unit:food.unit}))})]:[])]);return NextResponse.json({ok:true,count:input.foods.length});}catch(error){return apiError(error);}}
