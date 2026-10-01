import { Food, FoodCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFoodAllowed } from "@/services/dietary-safety";

export type Nutrition = { calories: number; protein: number; carbohydrates: number; fat: number; fiber: number; cost: number };
export function calculateFoodNutrition(food: Pick<Food, "servingSize" | "calories" | "protein" | "carbohydrates" | "fat" | "fiber" | "estimatedCost">, quantity: number): Nutrition {
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Quantity must be a non-negative number.");
  const factor = quantity / Number(food.servingSize);
  return { calories: round(Number(food.calories) * factor), protein: round(Number(food.protein) * factor), carbohydrates: round(Number(food.carbohydrates) * factor), fat: round(Number(food.fat) * factor), fiber: round(Number(food.fiber ?? 0) * factor), cost: round(Number(food.estimatedCost ?? 0) * factor) };
}
export const round = (value: number) => Math.round(value * 10) / 10;

export const foodRepository = {
  getFood(id: string) { return prisma.food.findUnique({ where: { id } }); },
  searchFoods(query: string, take = 20) { return prisma.food.findMany({ where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] }, take: Math.min(Math.max(take, 1), 50), orderBy: { name: "asc" } }); },
  getFoodsByCategory(category: FoodCategory) { return prisma.food.findMany({ where: { category }, orderBy: { name: "asc" } }); },
  async getFoodsMatchingDietaryRestrictions(input: { dietType: string; restrictionNames: string[] }) {
    const where: Prisma.FoodWhereInput = {};
    if (input.dietType === "VEGAN") where.isVegan = true;
    if (input.dietType === "VEGETARIAN" || input.dietType === "EGGETARIAN") where.isVegetarian = true;
    const restrictions=input.restrictionNames.map((name)=>({name,type:"ALLERGY"} as const));
    return (await prisma.food.findMany({ where, orderBy: { name: "asc" } })).filter((food)=>isFoodAllowed(food,input.dietType,restrictions));
  },
  async getFoodNutrition(foodId: string, quantity: number) {
    const food = await prisma.food.findUniqueOrThrow({ where: { id: foodId } });
    return { food, nutrition: calculateFoodNutrition(food, quantity) };
  },
};
