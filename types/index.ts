export type AppSection = "Dashboard" | "My Diet" | "My Workout" | "Progress" | "AI Coach" | "Profile" | "Settings";
export type OnboardingStep = "basics" | "fitness-level" | "goal" | "physique" | "activity" | "diet" | "meals" | "budget" | "workout" | "review";

export interface NutritionValues {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number;
}

export interface FoodPortion extends NutritionValues {
  foodId: string;
  name: string;
  quantity: number;
  unit: string;
  estimatedCost?: number;
  currency?: string;
}
