import { prisma } from "@/lib/prisma";
import { profileInputSchema } from "@/lib/validation";
import { FitPlanError } from "@/lib/errors";

/** Save profile-owned data atomically. The caller supplies the session-derived userId. */
export async function updateProfile(userId: string, input: unknown) {
  const parsed = profileInputSchema.parse(input);
  const { goal, physiqueGoal, restrictions, likedFoodIds, equipmentIds, preferredMealTimes, ...fields } = parsed;
  return prisma.$transaction(async (tx) => {
    if (equipmentIds?.length) {
      const count = await tx.equipment.count({ where: { id: { in: equipmentIds } } });
      if (count !== new Set(equipmentIds).size) throw new FitPlanError("VALIDATION_ERROR", "One or more selected equipment items are invalid.");
    }
    if (likedFoodIds?.length) {
      const count = await tx.food.count({ where: { id: { in: likedFoodIds } } });
      if (count !== new Set(likedFoodIds).size) throw new FitPlanError("VALIDATION_ERROR", "One or more selected foods are invalid.");
    }
    const profile = await tx.profile.upsert({
      where: { userId },
      create: { userId, ...fields, ...(preferredMealTimes !== undefined && { preferredMealTimes }) },
      update: { name: fields.name, ...(fields.age !== undefined && { age: fields.age }), ...(fields.sex !== undefined && { sex: fields.sex }), ...(fields.heightCm !== undefined && { heightCm: fields.heightCm }), ...(fields.currentWeightKg !== undefined && { currentWeightKg: fields.currentWeightKg }), ...(fields.targetWeightKg !== undefined && { targetWeightKg: fields.targetWeightKg }), ...(fields.fitnessLevel !== undefined && { fitnessLevel: fields.fitnessLevel }), ...(fields.activityLevel !== undefined && { activityLevel: fields.activityLevel }), ...(fields.dietType !== undefined && { dietType: fields.dietType }), ...(fields.mealsPerDay !== undefined && { mealsPerDay: fields.mealsPerDay }), ...(preferredMealTimes !== undefined && { preferredMealTimes }), ...(fields.dailyBudget !== undefined && { dailyBudget: fields.dailyBudget, budgetCurrency: fields.budgetCurrency }), ...(fields.workoutDaysPerWeek !== undefined && { workoutDaysPerWeek: fields.workoutDaysPerWeek }), ...(fields.workoutDurationMin !== undefined && { workoutDurationMin: fields.workoutDurationMin }) },
    });
    if (goal) {
      const option = await tx.fitnessGoalOption.findUnique({ where: { category: goal } });
      if (!option) throw new FitPlanError("VALIDATION_ERROR", "Selected fitness goal is not available.");
      await tx.fitnessGoal.updateMany({ where: { profileId: profile.id }, data: { isPrimary: false } });
      await tx.fitnessGoal.upsert({ where: { profileId_category: { profileId: profile.id, category: goal } }, create: { profileId: profile.id, category: goal, label: option.label, isPrimary: true }, update: { label: option.label, isPrimary: true } });
    }
    if (physiqueGoal) {
      const option = await tx.physiqueGoalOption.findUnique({ where: { slug: physiqueGoal } });
      if (!option) throw new FitPlanError("VALIDATION_ERROR", "Selected physique reference is not available.");
      await tx.physiqueGoal.deleteMany({ where: { profileId: profile.id } });
      await tx.physiqueGoal.create({ data: { profileId: profile.id, slug: `${userId}-${option.slug}`, name: option.name, description: option.description } });
    }
    if (restrictions !== undefined) {
      await tx.foodRestriction.deleteMany({ where: { userId } });
      if (restrictions.length) await tx.foodRestriction.createMany({ data: restrictions.map((restriction) => ({ userId, ...restriction })) });
    }
    if (likedFoodIds !== undefined) {
      await tx.userFoodPreference.deleteMany({ where: { userId } });
      if (likedFoodIds.length) await tx.userFoodPreference.createMany({ data: [...new Set(likedFoodIds)].map((foodId) => ({ userId, foodId })) });
    }
    if (equipmentIds !== undefined) {
      await tx.userEquipment.deleteMany({ where: { userId } });
      if (equipmentIds.length) await tx.userEquipment.createMany({ data: [...new Set(equipmentIds)].map((equipmentId) => ({ userId, equipmentId })) });
    }
    return tx.profile.findUniqueOrThrow({ where: { id: profile.id }, include: { fitnessGoals: true, physiqueGoals: true, referenceImages: { where: { isActive: true } }, user: { select: { foodRestrictions: true, foodPreferences: { include: { food: true } }, availableFoods: { include: { food: true } }, equipment: { include: { equipment: true } } } } } });
  });
}

export function getProfile(userId: string) {
  return prisma.profile.findUnique({ where: { userId }, include: { fitnessGoals: true, physiqueGoals: true, referenceImages: { where: { isActive: true } }, user: { select: { foodRestrictions: true, foodPreferences: { include: { food: true } }, availableFoods: { include: { food: true } }, equipment: { include: { equipment: true } } } } } });
}
