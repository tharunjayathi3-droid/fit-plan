import type { Exercise, MovementPattern } from "@prisma/client";
import { FitPlanError } from "@/lib/errors";
import type { Nutrition } from "@/services/food-service";

export function assertUserOwns(resourceOwnerId:string,userIdFromSession:string){if(!resourceOwnerId||resourceOwnerId!==userIdFromSession)throw new FitPlanError("FORBIDDEN","You do not have access to this record.",403);}

export function nutritionSimilarityScore(original:Nutrition,candidate:Nutrition,preferenceAdjustment=0,costAdjustment=0){
  const raw=Math.abs(candidate.calories-original.calories)/Math.max(original.calories,100)*.38+Math.abs(candidate.protein-original.protein)/Math.max(original.protein,10)*.38+Math.abs(candidate.carbohydrates-original.carbohydrates)/Math.max(original.carbohydrates,15)*.12+Math.abs(candidate.fat-original.fat)/Math.max(original.fat,10)*.12;
  return Math.max(0,Math.min(1,1-raw+preferenceAdjustment-costAdjustment));
}

export function exerciseSimilarityScore(original:Pick<Exercise,"primaryMuscle"|"secondaryMuscles"|"movementPattern"|"difficulty">,candidate:Pick<Exercise,"primaryMuscle"|"secondaryMuscles"|"movementPattern"|"difficulty">,skillRank:number){
  if(candidate.primaryMuscle!==original.primaryMuscle||candidate.movementPattern!==original.movementPattern)return 0;
  const shared=candidate.secondaryMuscles.filter((muscle)=>original.secondaryMuscles.includes(muscle)).length;
  return Math.min(1,.58+Math.min(.2,shared*.08)+(candidate.difficulty===original.difficulty ? .15 : 0)+(candidate.difficulty!=="ADVANCED"||skillRank>=3 ? .07 : 0));
}

export function selectMovementBalancedExercises<T extends Pick<Exercise,"id"|"primaryMuscle"|"secondaryMuscles"|"movementPattern">>(candidates:T[],targetMuscles:string[],limit:number){
  const chosen:T[]=[];const usedPatterns=new Set<MovementPattern>();
  for(const muscle of targetMuscles){if(chosen.length>=limit)break;const options=candidates.filter((exercise)=>exercise.primaryMuscle.toLowerCase().includes(muscle.toLowerCase())||exercise.secondaryMuscles.some((item)=>item.toLowerCase().includes(muscle.toLowerCase()))).filter((exercise)=>!usedPatterns.has(exercise.movementPattern));const match=options.find((exercise)=>!chosen.some((entry)=>entry.id===exercise.id));if(match){chosen.push(match);usedPatterns.add(match.movementPattern);}}
  for(const exercise of candidates){if(chosen.length>=limit)break;if(!chosen.some((entry)=>entry.id===exercise.id)&&!usedPatterns.has(exercise.movementPattern)){chosen.push(exercise);usedPatterns.add(exercise.movementPattern);}}
  return chosen;
}

export function calculateProgressChange(start:number,end:number){return Math.round((end-start)*10)/10;}
