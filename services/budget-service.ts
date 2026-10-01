import { round } from "@/services/food-service";
export interface BudgetFood { foodId: string; name: string; quantity: number; calories: number; protein: number; carbohydrates: number; fat: number; cost: number; replaceWith?: BudgetFood }
export interface BudgetPlan { foods: BudgetFood[]; budget: number }
export function optimizeDietBudget(plan: BudgetPlan, budget: number) {
  const before = plan.foods.reduce((sum, food) => sum + food.cost, 0);
  const selected = plan.foods.map((food) => ({ ...food }));
  const sorted = [...selected].sort((a,b) => b.cost - a.cost);
  const changes: Array<{ from: string; to: string; saving: number }> = [];
  let after = before;
  for (const food of sorted) {
    if (after <= budget) break;
    const alternative = food.replaceWith;
    if (!alternative || alternative.cost >= food.cost) continue;
    const originalRatio = food.protein / Math.max(food.calories, 1);
    const alternativeRatio = alternative.protein / Math.max(alternative.calories, 1);
    if (alternative.calories < food.calories * .7 || alternative.calories > food.calories * 1.3 || Math.abs(alternativeRatio - originalRatio) > Math.max(.08, originalRatio * .35)) continue;
    const saving = food.cost - alternative.cost;
    const index = selected.findIndex((entry) => entry.foodId === food.foodId);
    selected[index] = { ...alternative };
    changes.push({ from: food.name, to: alternative.name, saving: round(saving) });
    after -= saving;
  }
  const totals = (items: BudgetFood[]) => items.reduce((sum, item) => ({ calories: sum.calories + item.calories, protein: sum.protein + item.protein, carbohydrates: sum.carbohydrates + item.carbohydrates, fat: sum.fat + item.fat }), { calories: 0, protein: 0, carbohydrates: 0, fat: 0 });
  const originalNutrition = totals(plan.foods), newNutrition = totals(selected);
  return { foods: selected, originalCost: round(before), newCost: round(after), budget, withinBudget: after <= budget, changes, nutritionDifference: { calories: round(newNutrition.calories - originalNutrition.calories), protein: round(newNutrition.protein - originalNutrition.protein), carbohydrates: round(newNutrition.carbohydrates - originalNutrition.carbohydrates), fat: round(newNutrition.fat - originalNutrition.fat) } };
}
