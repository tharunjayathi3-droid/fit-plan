import { NextResponse } from "next/server";
import { GoalCategory, Sex } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { FitPlanError } from "@/lib/errors";
import { calculateNutritionTargets } from "@/services/nutrition-service";
const goalEnum = z.nativeEnum(GoalCategory);
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const profile = await prisma.profile.findUnique({ where: { userId: user.id }, include: { fitnessGoals: { where: { isPrimary: true } } } });
    if (!profile?.age || !profile.heightCm || !profile.currentWeightKg || !profile.activityLevel) throw new FitPlanError("INVALID_PROFILE", "Complete age, height, weight, and activity level before calculating targets.");
    const goal = goalEnum.safeParse(new URL(request.url).searchParams.get("goal") ?? profile.fitnessGoals[0]?.category);
    if (!goal.success) throw new FitPlanError("INVALID_PROFILE", "Choose a valid fitness goal to calculate targets.");
    return NextResponse.json({ targets: calculateNutritionTargets({ age: profile.age, sex: profile.sex ?? Sex.PREFER_NOT_TO_SAY, heightCm: Number(profile.heightCm), weightKg: Number(profile.currentWeightKg), activityLevel: profile.activityLevel, goal: goal.data }) });
  } catch (error) { return apiError(error); }
}
