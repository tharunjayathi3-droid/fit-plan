import { ExerciseDifficulty, MovementPattern, PlanStatus } from "@prisma/client";
import { FitPlanError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { selectMovementBalancedExercises } from "@/services/algorithm-core";

const splitTemplates: Record<number, string[][]> = {
  1: [["Full body", "Chest", "Back", "Quadriceps", "Hamstrings", "Core"]],
  2: [["Full body A", "Chest", "Back", "Quadriceps", "Hamstrings", "Core"], ["Full body B", "Chest", "Back", "Glutes", "Shoulders", "Core"]],
  3: [["Full body A", "Chest", "Back", "Quadriceps", "Core"], ["Full body B", "Chest", "Back", "Hamstrings", "Shoulders"], ["Full body C", "Chest", "Back", "Glutes", "Arms"]],
  4: [["Upper body", "Chest", "Back", "Shoulders", "Triceps", "Biceps"], ["Lower body", "Quadriceps", "Hamstrings", "Glutes", "Core"], ["Upper body 2", "Chest", "Back", "Shoulders", "Biceps"], ["Lower body 2", "Quadriceps", "Hamstrings", "Glutes", "Core"]],
  5: [["Chest + Triceps", "Chest", "Triceps", "Shoulders"], ["Back + Biceps", "Back", "Biceps", "Core"], ["Legs", "Quadriceps", "Hamstrings", "Glutes"], ["Upper body", "Chest", "Back", "Shoulders", "Arms"], ["Lower body + Core", "Quadriceps", "Hamstrings", "Glutes", "Core"]],
  6: [["Push", "Chest", "Shoulders", "Triceps"], ["Pull", "Back", "Biceps"], ["Legs", "Quadriceps", "Hamstrings", "Glutes"], ["Push 2", "Chest", "Shoulders", "Triceps"], ["Pull 2", "Back", "Biceps"], ["Legs + Core", "Quadriceps", "Hamstrings", "Core"]],
  7: [["Push", "Chest", "Shoulders", "Triceps"], ["Pull", "Back", "Biceps"], ["Legs", "Quadriceps", "Hamstrings", "Glutes"], ["Upper body", "Chest", "Back", "Shoulders"], ["Lower body", "Quadriceps", "Hamstrings", "Glutes"], ["Arms + Core", "Biceps", "Triceps", "Core"], ["Mobility + Core", "Core", "Glutes"]],
};
function levelRank(level: string) { return level === "BEGINNER" ? 1 : level === "ADVANCED" ? 3 : 2; }
function repsForGoal(goal: string, level: string) { if (goal === "STRENGTH") return { min: 4, max: 6, rest: 150, sets: level === "BEGINNER" ? 3 : 4 }; if (goal === "ENDURANCE") return { min: 12, max: 15, rest: 60, sets: 3 }; return { min: 8, max: 12, rest: 90, sets: 3 }; }

export async function generateWorkoutPlan(userId: string) {
  const profile=await prisma.profile.findUnique({where:{userId},include:{fitnessGoals:{where:{isPrimary:true}},physiqueGoals:{where:{isPrimary:true}}}});
  if(!profile?.fitnessLevel||!profile.workoutDaysPerWeek||!profile.workoutDurationMin)throw new FitPlanError("INVALID_PROFILE","Complete your fitness level and workout schedule before creating a workout plan.");
  const goal=profile.fitnessGoals[0]?.category;if(!goal)throw new FitPlanError("INVALID_PROFILE","Choose a primary fitness goal before creating a workout plan.");
  const fitnessLevel=profile.fitnessLevel!;const workoutDurationMin=profile.workoutDurationMin!;
  const available=await prisma.userEquipment.findMany({where:{userId},select:{equipmentId:true}});const availableIds=new Set(available.map((x)=>x.equipmentId));
  const daysPerWeek=Math.min(7,Math.max(1,profile.workoutDaysPerWeek));
  const [exercises,lastPlan]=await Promise.all([
    prisma.exercise.findMany({include:{equipment:{include:{equipment:true}}}}),
    prisma.workoutPlan.findFirst({where:{userId},orderBy:{version:"desc"},select:{version:true}}),
  ]);
  const candidates=exercises.filter((exercise)=>exercise.equipment.filter((e)=>e.isRequired).every((e)=>availableIds.has(e.equipmentId))&&levelRank(exercise.difficulty)<=levelRank(fitnessLevel)+1);
  if(!candidates.length)throw new FitPlanError("INVALID_PROFILE","Add equipment that matches at least one exercise before creating a workout plan.",422);
  const template=splitTemplates[daysPerWeek]??splitTemplates[3];const perGoal=repsForGoal(goal,fitnessLevel);const exerciseLimit=Math.max(3,Math.min(6,Math.floor(workoutDurationMin/10)));
  const days=template.map((split,dayIndex)=>{
    const name=split[0];const targetMuscles=split.slice(1);const chosen=selectMovementBalancedExercises(candidates,targetMuscles,exerciseLimit);
    return {name,sortOrder:dayIndex,scheduledOn:new Date(Date.now()+Math.floor(dayIndex*7/daysPerWeek)*86400_000),estimatedDurationMin:workoutDurationMin,exercises:chosen.map((exercise,index)=>({exerciseId:exercise.id,sortOrder:index,targetMuscle:exercise.primaryMuscle,sets:{create:Array.from({length:perGoal.sets},(_,setNumber)=>({setNumber:setNumber+1,targetRepsMin:perGoal.min,targetRepsMax:perGoal.max,restSeconds:perGoal.rest}))}}))};
  });
  if(days.some((day)=>day.exercises.length===0))throw new FitPlanError("INVALID_PROFILE","The exercise catalogue cannot fill every workout day for your equipment yet.",422);
  const createdAt=new Date();
  return prisma.$transaction(async(tx)=>{
    const plan=await tx.workoutPlan.create({data:{userId,name:`${daysPerWeek}-day ${goal.toLowerCase().replaceAll("_"," ")} plan`,status:PlanStatus.ACTIVE,startsAt:createdAt,version:(lastPlan?.version??0)+1,generationReason:`Split selected for ${daysPerWeek} training days, ${workoutDurationMin}-minute sessions, ${fitnessLevel.toLowerCase()} experience, and available equipment. Exercises use non-duplicated movement patterns when possible.`,days:{create:days.map(({exercises,...day})=>({...day,exercises:{create:exercises}}))}}});
    return {plan,daysPerWeek,estimatedDurationMin:workoutDurationMin,goal,physique:profile.physiqueGoals[0]?.name??null};
  });
}
