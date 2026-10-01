import { z } from "zod";
import { GoalCategory, Sex } from "@prisma/client";
import { FitPlanError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { calculateNutritionTargets } from "@/services/nutrition-service";
import { getProgressSummary } from "@/services/tracking-service";
import { findFoodAlternatives } from "@/services/food-alternative-service";
import { findExerciseAlternatives } from "@/services/exercise-alternative-service";
import { generateUpdatedPlan, analyzeProgress } from "@/services/progress-analysis-service";
import type { AITool } from "@/services/ai-provider";

const empty=z.object({}).strict();
const foodArgs=z.object({foodName:z.string().min(1).max(100),quantity:z.number().positive().max(10000).optional(),availableFoodsOnly:z.boolean().default(false)}).strict();
const exerciseArgs=z.object({exerciseName:z.string().min(1).max(100)}).strict();
const tools:AITool[]=[
  {type:"function",function:{name:"getUserProfile",description:"Get the signed-in user's relevant fitness and diet profile.",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"getCurrentDiet",description:"Get the signed-in user's latest meal plan and its database nutrition facts.",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"getCurrentWorkout",description:"Get the signed-in user's current workout plan and exercises.",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"getNutritionTargets",description:"Calculate estimated nutrition targets on the server using the profile and selected goal.",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"findFoodAlternatives",description:"Find safe, nutritionally similar alternatives from the food database. Use availableFoodsOnly only when the user asks to use foods they have.",parameters:{type:"object",properties:{foodName:{type:"string"},quantity:{type:"number"},availableFoodsOnly:{type:"boolean"}},required:["foodName"],additionalProperties:false}}},
  {type:"function",function:{name:"findExerciseAlternatives",description:"Find a safe exercise alternative based on the user's available equipment.",parameters:{type:"object",properties:{exerciseName:{type:"string"}},required:["exerciseName"],additionalProperties:false}}},
  {type:"function",function:{name:"getAvailableFoods",description:"List foods the signed-in user explicitly marked as available at home.",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"getProgress",description:"Summarize the signed-in user's own weight, strength, and workout adherence data.",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"generatePlanAdjustment",description:"Analyze the signed-in user's progress and create a versioned updated diet/workout plan only when data supports a justified update. Use only when the user asks to update or adjust their plan.",parameters:{type:"object",properties:{},additionalProperties:false}}},
];
export function aiTools(){return tools;}

export async function runUserTool(userId:string,name:string,raw:unknown):Promise<unknown>{
  if(name==="getUserProfile"){
    empty.parse(raw);return prisma.profile.findUnique({where:{userId},include:{fitnessGoals:{where:{isPrimary:true}},physiqueGoals:{where:{isPrimary:true}},user:{select:{foodRestrictions:true,foodPreferences:{include:{food:true}},equipment:{include:{equipment:true}}}}}});
  }
  if(name==="getCurrentDiet"){
    empty.parse(raw);return prisma.mealPlan.findFirst({where:{userId},orderBy:{version:"desc"},include:{meals:{orderBy:{scheduledAt:"asc"},include:{foods:{include:{food:true}}}}}});
  }
  if(name==="getCurrentWorkout"){
    empty.parse(raw);return prisma.workoutPlan.findFirst({where:{userId},orderBy:{version:"desc"},include:{days:{orderBy:{scheduledOn:"asc"},include:{exercises:{include:{exercise:true,sets:true}}}}}});
  }
  if(name==="getNutritionTargets"){
    empty.parse(raw);const profile=await prisma.profile.findUnique({where:{userId},include:{fitnessGoals:{where:{isPrimary:true}}}});if(!profile?.age||!profile.heightCm||!profile.currentWeightKg||!profile.activityLevel||!profile.fitnessGoals[0])throw new FitPlanError("INVALID_PROFILE","Complete your profile and select a goal before calculating nutrition targets.");return calculateNutritionTargets({age:profile.age,sex:profile.sex??Sex.PREFER_NOT_TO_SAY,heightCm:Number(profile.heightCm),weightKg:Number(profile.currentWeightKg),activityLevel:profile.activityLevel,goal:profile.fitnessGoals[0].category});
  }
  if(name==="findFoodAlternatives"){
    const args=foodArgs.parse(raw);const food=await prisma.food.findFirst({where:{name:{contains:args.foodName,mode:"insensitive"}}});if(!food)throw new FitPlanError("NOT_FOUND","No database food matched that name.",404);const available=args.availableFoodsOnly?(await prisma.userAvailableFood.findMany({where:{userId},select:{foodId:true}})).map((x)=>x.foodId):undefined;return findFoodAlternatives(food.id,userId,available,args.quantity);
  }
  if(name==="findExerciseAlternatives"){
    const args=exerciseArgs.parse(raw);const exercise=await prisma.exercise.findFirst({where:{name:{contains:args.exerciseName,mode:"insensitive"}}});if(!exercise)throw new FitPlanError("NOT_FOUND","No database exercise matched that name.",404);return findExerciseAlternatives(exercise.id,userId);
  }
  if(name==="getAvailableFoods"){
    empty.parse(raw);return prisma.userAvailableFood.findMany({where:{userId},include:{food:true},orderBy:{food:{name:"asc"}}});
  }
  if(name==="getProgress"){empty.parse(raw);return getProgressSummary(userId);}
  if(name==="generatePlanAdjustment"){empty.parse(raw);const analysis=await analyzeProgress(userId);if(analysis.decisions.some((reason)=>reason.includes("not enough recent data")))return {analysis,created:false,message:"There is not enough progress data to justify a new plan."};return generateUpdatedPlan(userId);}
  throw new FitPlanError("VALIDATION_ERROR","The requested assistant capability is not available.",400);
}
