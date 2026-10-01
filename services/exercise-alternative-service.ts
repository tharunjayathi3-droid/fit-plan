import { ExerciseDifficulty } from "@prisma/client";
import { FitPlanError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { exerciseSimilarityScore } from "@/services/algorithm-core";

const difficultyRank: Record<ExerciseDifficulty, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };
export async function findExerciseAlternatives(exerciseId: string, userId: string) {
  const [original, equipment, profile] = await Promise.all([
    prisma.exercise.findUnique({ where: { id: exerciseId }, include: { equipment: { include: { equipment: true } } } }),
    prisma.userEquipment.findMany({ where: { userId }, select: { equipmentId: true } }),
    prisma.profile.findUnique({ where: { userId }, select: { fitnessLevel: true } }),
  ]);
  if (!original) throw new FitPlanError("NOT_FOUND", "The original exercise was not found.", 404);
  const availableIds = new Set(equipment.map((item) => item.equipmentId));
  const compatible = await prisma.exercise.findMany({ where: { id: { not: original.id }, primaryMuscle: original.primaryMuscle, movementPattern: original.movementPattern }, include: { equipment: { include: { equipment: true } } } });
  const userLevel = profile?.fitnessLevel === "BEGINNER" ? 1 : profile?.fitnessLevel === "ADVANCED" ? 3 : 2;
  const ranked = compatible.filter((candidate) => candidate.equipment.filter((entry) => entry.isRequired).every((entry) => availableIds.has(entry.equipmentId)) && difficultyRank[candidate.difficulty] <= userLevel + 1).map((candidate) => {
    const score = exerciseSimilarityScore(original,candidate,userLevel);
    return { exerciseId: candidate.id, name: candidate.name, primaryMuscle: candidate.primaryMuscle, secondaryMuscles: candidate.secondaryMuscles, movementPattern: candidate.movementPattern, difficulty: candidate.difficulty, equipment: candidate.equipment.map((entry) => entry.equipment.name), score: Math.min(1, Math.round(score * 100) / 100), explanation: `Trains ${candidate.primaryMuscle.toLowerCase()} with the same movement pattern and equipment you have available.` };
  }).sort((a,b)=>b.score-a.score).slice(0,5);
  if (!ranked.length) throw new FitPlanError("NO_SUITABLE_EXERCISE_ALTERNATIVE", "No exercise alternative fits your available equipment and training level.", 422);
  return { original: { exerciseId: original.id, name: original.name, primaryMuscle: original.primaryMuscle, movementPattern: original.movementPattern, equipment: original.equipment.map((entry) => entry.equipment.name) }, recommended: ranked[0], alternatives: ranked.slice(1) };
}
