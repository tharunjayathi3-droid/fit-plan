import { Food, FoodRestriction, UserFoodPreference } from "@prisma/client";
import { FitPlanError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { calculateFoodNutrition, round } from "@/services/food-service";
import { isDislikedFood, isFoodAllowed } from "@/services/dietary-safety";
import { nutritionSimilarityScore } from "@/services/algorithm-core";

type Candidate = Food & { preferences?: UserFoodPreference[] };
export interface FoodAlternativeResult {
  original: { foodId: string; name: string; quantity: number; unit: string; nutrition: ReturnType<typeof calculateFoodNutrition> };
  recommended: { foodId: string; name: string; quantity: number; unit: string; nutrition: ReturnType<typeof calculateFoodNutrition>; score: number; explanation: string };
  alternatives: Array<FoodAlternativeResult["recommended"]>;
  currency: string | null;
}

function normalized(s: string) { return s.trim().toLowerCase(); }
function portionForMatch(original: ReturnType<typeof calculateFoodNutrition>, originalQuantity: number, food: Food) {
  const step = food.servingUnit.toLowerCase() === "g" || food.servingUnit.toLowerCase() === "ml" ? 5 : 0.25;
  const max = Math.min(Math.max(originalQuantity * 3, Number(food.servingSize) * 3), 1200);
  let bestQuantity = Number(food.servingSize), bestScore = Number.POSITIVE_INFINITY;
  for (let q = step; q <= max; q += step) {
    const nutrition = calculateFoodNutrition(food, q);
    const score = Math.abs(nutrition.calories - original.calories) / Math.max(original.calories, 100) * .38 + Math.abs(nutrition.protein - original.protein) / Math.max(original.protein, 10) * .38 + Math.abs(nutrition.carbohydrates - original.carbohydrates) / Math.max(original.carbohydrates, 15) * .12 + Math.abs(nutrition.fat - original.fat) / Math.max(original.fat, 10) * .12;
    if (score < bestScore) { bestScore = score; bestQuantity = q; }
  }
  return { quantity: round(bestQuantity), score: bestScore };
}

/** User id must come from the authenticated server session. Passing an available list explicitly activates available-food-only mode. */
export async function findFoodAlternatives(originalFoodId: string, userId: string, availableFoods?: string[], quantity?: number) {
  const [original, profile, restrictions, preferences, available] = await Promise.all([
    prisma.food.findUnique({ where: { id: originalFoodId } }),
    prisma.profile.findUnique({ where: { userId }, select: { dietType: true } }),
    prisma.foodRestriction.findMany({ where: { userId } }),
    prisma.userFoodPreference.findMany({ where: { userId } }),
    availableFoods === undefined ? Promise.resolve(null) : prisma.userAvailableFood.findMany({ where: { userId, foodId: { in: availableFoods } }, select: { foodId: true } }),
  ]);
  if (!original) throw new FitPlanError("NOT_FOUND", "The original food was not found.", 404);
  const originalQty = quantity ?? Number(original.servingSize);
  const originalNutrition = calculateFoodNutrition(original, originalQty);
  const eligibleIds = availableFoods === undefined ? undefined : new Set(available?.map((item) => item.foodId) ?? []);
  const candidates = await prisma.food.findMany({ where: { ...(eligibleIds ? { id: { in: [...eligibleIds].filter((id)=>id!==original.id) } } : { id: { not: original.id } }), ...(profile?.dietType === "VEGAN" ? { isVegan: true } : {}), ...((profile?.dietType === "VEGETARIAN" || profile?.dietType === "EGGETARIAN") ? { isVegetarian: true } : {}) }, include: { preferences: { where: { userId } } } });
  const compatible = (candidates as Candidate[]).filter((food) => isFoodAllowed(food, profile?.dietType ?? "NO_RESTRICTION", restrictions));
  const ranked = compatible.map((food) => {
    const portion = portionForMatch(originalNutrition, originalQty, food);
    const disliked = isDislikedFood(food, restrictions);
    const preference = food.preferences?.[0]?.liked === false ? .12 : food.preferences?.[0]?.liked === true ? -.06 : 0;
    const nutrition = calculateFoodNutrition(food, portion.quantity);
    const costAdjustment = nutrition.cost > originalNutrition.cost * 1.5 ? .08 : 0;
    const score = nutritionSimilarityScore(originalNutrition,nutrition,preference-(disliked ? .35 : 0),costAdjustment);
    return { foodId: food.id, name: food.name, quantity: portion.quantity, unit: food.servingUnit, nutrition, score: round(score), explanation: score > .8 ? "Close nutrition match that fits your preferences." : "A reasonable match; nutrition differs from the original serving." };
  }).sort((a, b) => b.score - a.score || a.nutrition.cost - b.nutrition.cost).slice(0, 5);
  if (!ranked.length) throw new FitPlanError("NO_SUITABLE_FOOD_ALTERNATIVE", "No safe food alternative was found. Try adding foods to the database or review your restrictions.", 422);
  return { original: { foodId: original.id, name: original.name, quantity: originalQty, unit: original.servingUnit, nutrition: originalNutrition }, recommended: ranked[0], alternatives: ranked.slice(1), currency: original.currency } satisfies FoodAlternativeResult;
}
