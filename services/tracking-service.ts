import { ProgressMetric } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FitPlanError } from "@/lib/errors";
import { calculateFoodNutrition, round } from "@/services/food-service";
import { isFoodAllowed } from "@/services/dietary-safety";

async function assertOwnedWorkoutDay(userId:string,dayId:string){const day=await prisma.workoutDay.findFirst({where:{id:dayId,workoutPlan:{userId}},include:{exercises:{include:{exercise:true,sets:true}}}});if(!day)throw new FitPlanError("NOT_FOUND","Workout was not found.",404);return day;}
export async function startWorkout(userId:string,dayId:string){const day=await assertOwnedWorkoutDay(userId,dayId);if(day.completedAt)throw new FitPlanError("VALIDATION_ERROR","This workout is already complete.");return prisma.workoutDay.update({where:{id:day.id},data:{startedAt:day.startedAt??new Date()}});}
export async function startExercise(userId:string,workoutExerciseId:string){const exercise=await prisma.workoutExercise.findFirst({where:{id:workoutExerciseId,workoutDay:{workoutPlan:{userId}}}});if(!exercise)throw new FitPlanError("NOT_FOUND","Exercise was not found in your workout.",404);return prisma.workoutExercise.update({where:{id:exercise.id},data:{startedAt:exercise.startedAt??new Date()}});}
export async function completeSet(userId:string,setId:string,input:{reps:number;weightKg?:number}){
  const set=await prisma.workoutSet.findFirst({where:{id:setId,workoutExercise:{workoutDay:{workoutPlan:{userId}}}},include:{workoutExercise:{include:{exercise:true}}}});if(!set)throw new FitPlanError("NOT_FOUND","Set was not found in your workout.",404);
  const updated=await prisma.$transaction(async(tx)=>{const saved=await tx.workoutSet.update({where:{id:set.id},data:{completedReps:input.reps,completedWeightKg:input.weightKg,completedAt:new Date()}});await tx.exercisePerformance.create({data:{userId,exerciseId:set.workoutExercise.exerciseId,sets:1,reps:input.reps,weightKg:input.weightKg,performedAt:new Date(),notes:`Workout set ${set.setNumber}`}});return saved;});return updated;
}
export async function completeWorkout(userId:string,dayId:string){const day=await assertOwnedWorkoutDay(userId,dayId);if(day.completedAt)throw new FitPlanError("VALIDATION_ERROR","This workout is already complete.");const now=new Date();const durationMin=day.startedAt?Math.max(1,Math.round((now.getTime()-day.startedAt.getTime())/60000)):null;return prisma.$transaction(async(tx)=>{const saved=await tx.workoutDay.update({where:{id:dayId},data:{completedAt:now,durationMin,startedAt:day.startedAt??now}});await tx.workoutExercise.updateMany({where:{workoutDayId:dayId},data:{completedAt:now}});return saved;});}

export async function recordProgress(userId:string,input:{metric:ProgressMetric;value:number;unit:string;recordedAt?:Date;notes?:string}){return prisma.progressEntry.create({data:{userId,...input}});}
export async function getProgressSummary(userId:string){
  const [entries,performances,days]=await Promise.all([
    prisma.progressEntry.findMany({where:{userId},orderBy:{recordedAt:"asc"}}),
    prisma.exercisePerformance.findMany({where:{userId},include:{exercise:{select:{id:true,name:true,primaryMuscle:true}}},orderBy:{performedAt:"desc"},take:100}),
    prisma.workoutDay.findMany({where:{workoutPlan:{userId},scheduledOn:{gte:new Date(Date.now()-30*86400_000)}},select:{completedAt:true,scheduledOn:true}}),
  ]);
  const weights=entries.filter((entry)=>entry.metric===ProgressMetric.BODY_WEIGHT);const latest=weights.at(-1);const starting=weights[0];
  const trends=entries.reduce<Record<string,typeof entries>>((acc,entry)=>((acc[entry.metric]??=[]).push(entry),acc),{});
  const strengthByExercise=new Map<string,{name:string;points:Array<{date:Date;weightKg:number;reps:number|null}>}>();
  for(const performance of performances){if(!performance.weightKg)continue;const current=strengthByExercise.get(performance.exerciseId)??{name:performance.exercise.name,points:[]};current.points.push({date:performance.performedAt,weightKg:Number(performance.weightKg),reps:performance.reps});strengthByExercise.set(performance.exerciseId,current);}
  const completed=days.filter((day)=>day.completedAt).length;
  return {currentWeight:latest?{value:Number(latest.value),unit:latest.unit,date:latest.recordedAt}:null,startingWeight:starting?{value:Number(starting.value),unit:starting.unit,date:starting.recordedAt}:null,weightChange:latest&&starting?round(Number(latest.value)-Number(starting.value)):null,weightTrend:trends[ProgressMetric.BODY_WEIGHT]??[],measurements:entries.filter((entry)=>entry.metric!==ProgressMetric.BODY_WEIGHT),strengthTrend:[...strengthByExercise.entries()].map(([exerciseId,data])=>({exerciseId,...data,points:data.points.reverse()})),workoutAdherence:{completed,last30Days:days.length,ratio:days.length?round(completed/days.length):0},recentPerformances:performances.slice(0,20)};
}

export async function replaceMealFood(userId:string,mealFoodId:string,replacementFoodId:string,quantity:number){
  const [mealFood,replacement,restrictions,profile]=await Promise.all([
    prisma.mealFood.findFirst({where:{id:mealFoodId,meal:{mealPlan:{userId}}},include:{food:true,meal:{include:{foods:{include:{food:true}}}}}}),
    prisma.food.findUnique({where:{id:replacementFoodId}}),prisma.foodRestriction.findMany({where:{userId,type:{in:["ALLERGY","INTOLERANCE","CANNOT_EAT"]}}}),prisma.profile.findUnique({where:{userId},select:{dietType:true}}),
  ]);
  if(!mealFood||!replacement)throw new FitPlanError("NOT_FOUND","Meal item or replacement food was not found.",404);
  if(!isFoodAllowed(replacement,profile?.dietType??"NO_RESTRICTION",restrictions))throw new FitPlanError("INVALID_DIET_RESTRICTION","This food conflicts with a dietary preference or restriction on your profile.",422);
  const oldValues=calculateFoodNutrition(mealFood.food,Number(mealFood.quantity));const quantityInUnit=quantity;const newValues=calculateFoodNutrition(replacement,quantityInUnit);
  return prisma.$transaction(async(tx)=>{await tx.mealFood.update({where:{id:mealFoodId},data:{foodId:replacementFoodId,quantity:quantityInUnit,unit:replacement.servingUnit,calories:newValues.calories,protein:newValues.protein,carbohydrates:newValues.carbohydrates,fat:newValues.fat,fiber:newValues.fiber,estimatedCost:newValues.cost,currency:replacement.currency}});const totals=mealFood.meal.foods.reduce((sum,entry)=>{const n=entry.id===mealFoodId?newValues:{calories:Number(entry.calories),protein:Number(entry.protein),carbohydrates:Number(entry.carbohydrates),fat:Number(entry.fat),fiber:Number(entry.fiber),cost:Number(entry.estimatedCost??0)};return{calories:sum.calories+n.calories,protein:sum.protein+n.protein,carbohydrates:sum.carbohydrates+n.carbohydrates,fat:sum.fat+n.fat,cost:sum.cost+n.cost};},{calories:0,protein:0,carbohydrates:0,fat:0,cost:0});await tx.meal.update({where:{id:mealFood.mealId},data:{caloriesTotal:round(totals.calories),proteinTotal:round(totals.protein),carbohydratesTotal:round(totals.carbohydrates),fatTotal:round(totals.fat),estimatedCost:round(totals.cost)}});const planCost=await tx.meal.aggregate({where:{mealPlanId:mealFood.meal.mealPlanId},_sum:{estimatedCost:true}});await tx.mealPlan.update({where:{id:mealFood.meal.mealPlanId},data:{totalEstimatedCost:planCost._sum.estimatedCost}});return{mealFoodId,original:{name:mealFood.food.name,nutrition:oldValues},replacement:{name:replacement.name,quantity,unit:replacement.servingUnit,nutrition:newValues}};});
}

export async function replaceWorkoutExercise(userId:string,workoutExerciseId:string,exerciseId:string){const current=await prisma.workoutExercise.findFirst({where:{id:workoutExerciseId,workoutDay:{workoutPlan:{userId}}},include:{exercise:true}});if(!current)throw new FitPlanError("NOT_FOUND","Workout exercise was not found.",404);const alternatives=await import("@/services/exercise-alternative-service").then((m)=>m.findExerciseAlternatives(current.exerciseId,userId));const selected=[alternatives.recommended,...alternatives.alternatives].find((entry)=>entry.exerciseId===exerciseId);if(!selected)throw new FitPlanError("NO_SUITABLE_EXERCISE_ALTERNATIVE","Choose one of the safe alternatives returned by FitPlan.",422);return prisma.workoutExercise.update({where:{id:workoutExerciseId},data:{exerciseId,targetMuscle:selected.primaryMuscle}});}
