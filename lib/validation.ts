import { ActivityLevel, DietType, ExerciseDifficulty, FitnessLevel, GoalCategory, RestrictionSeverity, RestrictionType, Sex } from "@prisma/client";
import { z } from "zod";

export const profileInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  age: z.number().int().min(13).max(120).optional(),
  sex: z.enum(["FEMALE", "MALE", "INTERSEX", "PREFER_NOT_TO_SAY"]).optional(),
  heightCm: z.number().positive().max(300).optional(),
  currentWeightKg: z.number().positive().max(500).optional(),
  targetWeightKg: z.number().positive().max(500).optional(),
  dailyBudget: z.number().positive().optional(),
  budgetCurrency: z.string().length(3).toUpperCase().optional(),
  mealsPerDay: z.number().int().min(1).max(12).optional(),
  workoutDaysPerWeek: z.number().int().min(1).max(7).optional(),
  workoutDurationMin: z.number().int().min(10).max(240).optional(),
  fitnessLevel: z.nativeEnum(FitnessLevel).optional(),
  activityLevel: z.nativeEnum(ActivityLevel).optional(),
  dietType: z.nativeEnum(DietType).optional(),
  goal: z.nativeEnum(GoalCategory).optional(),
  physiqueGoal: z.string().trim().min(1).max(80).optional(),
  preferredMealTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(12).optional(),
  restrictions: z.array(z.object({ name: z.string().trim().min(1).max(120), type: z.nativeEnum(RestrictionType), severity: z.nativeEnum(RestrictionSeverity).optional() })).max(100).optional(),
  likedFoodIds: z.array(z.string().min(1)).max(500).optional(),
  equipmentIds: z.array(z.string().min(1)).max(50).optional(),
}).superRefine((value, ctx) => {
  if ((value.dailyBudget === undefined) !== (value.budgetCurrency === undefined)) ctx.addIssue({ code: "custom", path: ["budgetCurrency"], message: "Provide both daily budget and 3-letter currency." });
  if (value.dailyBudget !== undefined && value.dailyBudget > 100000) ctx.addIssue({ code: "custom", path: ["dailyBudget"], message: "Daily budget must be 100,000 or less." });
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
