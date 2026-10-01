import { ActivityLevel, GoalCategory, Sex } from "@prisma/client";
import { FitPlanError } from "@/lib/errors";

export interface NutritionProfile {
  age: number; sex?: Sex | null; heightCm: number; weightKg: number;
  activityLevel: ActivityLevel; goal: GoalCategory;
}
export interface NutritionTargets { bmr: number; tdee: number; calories: number; protein: number; fat: number; carbohydrates: number; method: string; isEstimate: true }

/** Mifflin–St Jeor BMR × standard activity factor; conservative goal adjustments. All outputs are estimates. */
export function calculateNutritionTargets(profile: NutritionProfile): NutritionTargets {
  if (!Number.isInteger(profile.age) || profile.age < 13 || profile.age > 120 || profile.heightCm <= 0 || profile.weightKg <= 0) throw new FitPlanError("INVALID_PROFILE", "Age, height, and weight must be valid before targets can be estimated.");
  const sexAdjustment = profile.sex === Sex.MALE ? 5 : profile.sex === Sex.FEMALE ? -161 : -78;
  const bmr = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexAdjustment;
  const factors: Record<ActivityLevel, number> = { SEDENTARY: 1.2, LIGHTLY_ACTIVE: 1.375, MODERATELY_ACTIVE: 1.55, VERY_ACTIVE: 1.725, EXTREMELY_ACTIVE: 1.9 };
  const tdee = bmr * factors[profile.activityLevel];
  const adjustment: Partial<Record<GoalCategory, number>> = { FAT_LOSS: -0.15, WEIGHT_LOSS: -0.15, MUSCLE_GAIN: 0.08, WEIGHT_GAIN: 0.1, RECOMPOSITION: -0.05 };
  const calories = Math.round(Math.max(1200, tdee * (1 + (adjustment[profile.goal] ?? 0))));
  const protein = Math.round(profile.weightKg * (profile.goal === GoalCategory.MUSCLE_GAIN || profile.goal === GoalCategory.STRENGTH ? 1.8 : 1.6));
  const fat = Math.round(Math.max(0, calories * 0.28 / 9));
  const carbohydrates = Math.round(Math.max(0, (calories - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), calories, protein, fat, carbohydrates, method: "Mifflin–St Jeor with standard activity multipliers; general goal adjustment; estimates only", isEstimate: true };
}
