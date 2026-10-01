import { GoalCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FitPlanError } from "@/lib/errors";
import { getProgressSummary } from "@/services/tracking-service";

export async function analyzeProgress(userId:string){
  const [summary,profile]=await Promise.all([getProgressSummary(userId),prisma.profile.findUnique({where:{userId},include:{fitnessGoals:{where:{isPrimary:true}}}})]);
  if(!profile)throw new FitPlanError("INVALID_PROFILE","Create your profile before reviewing plan progress.");
  const weightPoints=summary.weightTrend.map((entry)=>Number(entry.value));const recent=weightPoints.slice(-4);const earlier=weightPoints.slice(-8,-4);
  const recentAverage=recent.length?recent.reduce((a,b)=>a+b,0)/recent.length:null;const earlierAverage=earlier.length?earlier.reduce((a,b)=>a+b,0)/earlier.length:null;
  const weightDelta=recentAverage!==null&&earlierAverage!==null?Math.round((recentAverage-earlierAverage)*10)/10:null;
  const goal=profile.fitnessGoals[0]?.category??GoalCategory.GENERAL_FITNESS;
  const notableLifts=summary.strengthTrend.map((lift)=>({name:lift.name,change:lift.points.length>1?Math.round((lift.points.at(-1)!.weightKg-lift.points[0]!.weightKg)*10)/10:0}));
  const progressingLifts=notableLifts.filter((lift)=>lift.change>0).length;
  const hasEnoughWeightData=recent.length>=2&&earlier.length>=2;
  const hasEnoughPerformanceData=summary.strengthTrend.some((lift)=>lift.points.length>=2);
  const hasEnoughAdherenceData=summary.workoutAdherence.last30Days>=3;
  const hasEnoughData=hasEnoughWeightData||hasEnoughPerformanceData||hasEnoughAdherenceData;
  const decisions:string[]=[];
  if(!hasEnoughData)decisions.push("There is not enough recent data to justify a plan change. Keep the current plan and continue recording progress.");
  else if(summary.workoutAdherence.ratio<.6)decisions.push("Adherence has been under 60%; keep the current plan targets and discuss a more practical schedule before adding training volume.");
  else if(summary.workoutAdherence.ratio>=.8)decisions.push("Workout adherence is strong; maintain the current schedule while reviewing strength and body-weight trends.");
  if(weightDelta!==null){if(new Set<GoalCategory>([GoalCategory.FAT_LOSS,GoalCategory.WEIGHT_LOSS]).has(goal)&&weightDelta>=-.1)decisions.push("Recent weight trend is stable relative to the selected weight-loss goal; verify meal logging and preferences before a modest nutrition adjustment.");else if(new Set<GoalCategory>([GoalCategory.MUSCLE_GAIN,GoalCategory.WEIGHT_GAIN]).has(goal)&&weightDelta<=.1)decisions.push("Recent weight trend is stable relative to the selected gain goal; review food adherence before adjusting the plan.");else decisions.push("Recent weight trend is moving in the selected direction; avoid an unnecessary calorie change.");}
  if(progressingLifts>0)decisions.push(`${progressingLifts} tracked lift${progressingLifts===1?" is":"s are"} progressing. Keep those exercise prescriptions unless the user reports pain or a constraint.`);
  return {goal,weightDelta,adherence:summary.workoutAdherence,progressingLifts,decisions,hasEnoughWeightData,hasEnoughData,analyzedAt:new Date().toISOString()};
}

/** Adds immutable next-version plan records only after the analyzer can state why a version is needed. */
export async function generateUpdatedPlan(userId:string){
  const analysis=await analyzeProgress(userId);
  if(!analysis.hasEnoughData)throw new FitPlanError("INVALID_PROFILE","There isn't enough progress data to justify a new plan yet.",422);
  const {generateDietPlan}=await import("@/services/diet-generation-service");const {generateWorkoutPlan}=await import("@/services/workout-generation-service");
  let diet:Awaited<ReturnType<typeof generateDietPlan>>|undefined;let workout:Awaited<ReturnType<typeof generateWorkoutPlan>>|undefined;
  const results=await Promise.allSettled([generateDietPlan(userId),generateWorkoutPlan(userId)]);
  if(results[0].status==="fulfilled")diet=results[0].value;
  if(results[1].status==="fulfilled")workout=results[1].value;
  const failed=results.find((result)=>result.status==="rejected");
  if(failed) {
    await prisma.$transaction([
      ...(diet?.plan.id?[prisma.mealPlan.delete({where:{id:diet.plan.id}})]:[]),
      ...(workout?.plan.id?[prisma.workoutPlan.delete({where:{id:workout.plan.id}})]:[]),
    ]);
    throw failed.reason;
  }
  if(!diet||!workout)throw new FitPlanError("DATABASE_ERROR","Could not create the next plan version.",500);
  const reason=analysis.decisions.join(" ");
  await prisma.$transaction([prisma.mealPlan.update({where:{id:diet.plan.id},data:{generationReason:reason}}),prisma.workoutPlan.update({where:{id:workout.plan.id},data:{generationReason:reason}})]);
  return {diet:await prisma.mealPlan.findUnique({where:{id:diet.plan.id}}),workout:await prisma.workoutPlan.findUnique({where:{id:workout.plan.id}}),analysis,reason};
}
