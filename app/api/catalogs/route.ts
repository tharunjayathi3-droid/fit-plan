import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
export async function GET(){try{await requireUser();const [goals,physiques,diets,equipment,foods]=await Promise.all([prisma.fitnessGoalOption.findMany({orderBy:{label:"asc"}}),prisma.physiqueGoalOption.findMany({orderBy:{name:"asc"}}),prisma.dietPreference.findMany({orderBy:{name:"asc"}}),prisma.equipment.findMany({orderBy:{name:"asc"}}),prisma.food.findMany({select:{id:true,name:true,category:true,servingSize:true,servingUnit:true,calories:true,protein:true,carbohydrates:true,fat:true,estimatedCost:true,currency:true},orderBy:{name:"asc"}})]);return NextResponse.json({goals,physiques,diets,equipment,foods});}catch(error){return apiError(error);}}
