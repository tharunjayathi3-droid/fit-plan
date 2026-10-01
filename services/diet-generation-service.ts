import { Food, GoalCategory, MealType, PlanStatus, Prisma } from "@prisma/client";
import { FitPlanError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { calculateNutritionTargets } from "@/services/nutrition-service";
import { calculateFoodNutrition, round } from "@/services/food-service";
import { isDislikedFood, isFoodAllowed } from "@/services/dietary-safety";

const clockTimes = ["08:00", "12:30", "16:00", "19:30", "10:30", "15:00"];
type PlanFood = { food: Food; quantity: number; values: ReturnType<typeof calculateFoodNutrition> };
type BuiltMeal = { type: MealType; name: string; scheduledAt: Date; items: PlanFood[]; totals: ReturnType<typeof sumFoods> };
function sumFoods(items: PlanFood[]) { return items.reduce((acc,item)=>({calories:acc.calories+item.values.calories,protein:acc.protein+item.values.protein,carbohydrates:acc.carbohydrates+item.values.carbohydrates,fat:acc.fat+item.values.fat,cost:acc.cost+item.values.cost}),{calories:0,protein:0,carbohydrates:0,fat:0,cost:0}); }
function quantityFor(food: Food, desired: number, field: "protein"|"calories") {
  const perServing = Number(food[field]);
  if (perServing <= 0) return Number(food.servingSize);
  const desiredServing = Math.max(.25, desired / perServing);
  return round(Number(food.servingSize) * desiredServing);
}
function selectByType(foods: Food[], types: string[], offset: number, excluded: Set<string>) { const choices=foods.filter((food)=>types.includes(food.category)&&!excluded.has(food.id));return choices.length?choices[offset%choices.length]:foods.filter((food)=>!excluded.has(food.id))[offset%Math.max(1,foods.filter((food)=>!excluded.has(food.id)).length)]; }
function mealLabel(type: MealType) { return type.toLowerCase().replace(/^./,c=>c.toUpperCase()); }
function buildMeals(day: Date, count: number, foods: Food[], targets: {calories:number;protein:number}, dayOffset: number): BuiltMeal[] {
  const meals: BuiltMeal[]=[];
  const dayMeals: MealType[] = count === 2 ? [MealType.BREAKFAST,MealType.DINNER] : count === 3 ? [MealType.BREAKFAST,MealType.LUNCH,MealType.DINNER] : count === 4 ? [MealType.BREAKFAST,MealType.LUNCH,MealType.SNACK,MealType.DINNER] : count === 5 ? [MealType.BREAKFAST,MealType.SNACK,MealType.LUNCH,MealType.SNACK,MealType.DINNER] : [MealType.BREAKFAST,MealType.SNACK,MealType.LUNCH,MealType.SNACK,MealType.DINNER,MealType.SNACK];
  for(let index=0;index<count;index++){
    const type=dayMeals[index]??MealType.SNACK;const excludedForMeal=new Set<string>();const offset=dayOffset*2+index;
    const proteinFood=selectByType(foods,["PROTEIN","DAIRY","LEGUME","NUT_SEED"],offset,excludedForMeal);if(!proteinFood)throw new FitPlanError("INVALID_DIET_RESTRICTION","No suitable foods are available for your dietary restrictions.",422);excludedForMeal.add(proteinFood.id);
    const grainFood=selectByType(foods,["GRAIN","FRUIT"],offset+1,excludedForMeal);if(grainFood)excludedForMeal.add(grainFood.id);
    const produceFood=selectByType(foods,["VEGETABLE","FRUIT"],offset+3,excludedForMeal);
    const perMealProtein=targets.protein/count;
    const proteinQuantity=quantityFor(proteinFood,perMealProtein*.72,"protein");
    const proteinItem={food:proteinFood,quantity:proteinQuantity,values:calculateFoodNutrition(proteinFood,proteinQuantity)};
    const items=[proteinItem];
    if(grainFood){const neededCalories=targets.calories/count*.52;const quantity=quantityFor(grainFood,neededCalories,"calories");items.push({food:grainFood,quantity,values:calculateFoodNutrition(grainFood,quantity)});}
    if(produceFood){const quantity=quantityFor(produceFood,Math.max(50,Number(produceFood.servingSize)),"calories");items.push({food:produceFood,quantity,values:calculateFoodNutrition(produceFood,quantity)});}
    const time=clockTimes[index]??"18:00";const scheduledAt=new Date(day);const [hour,minute]=time.split(":").map(Number);scheduledAt.setHours(hour,minute,0,0);
    meals.push({type,name:mealLabel(type),scheduledAt,items,totals:sumFoods(items)});
  }
  return meals;
}
function chooseCheaperFood(food: Food, candidates: Food[]) {
  const original=calculateFoodNutrition(food,Number(food.servingSize));
  const compatible=candidates.filter((candidate)=>candidate.id!==food.id&&candidate.currency===food.currency&&Number(candidate.estimatedCost??Infinity)<Number(food.estimatedCost??Infinity));
  return compatible.map((candidate)=>{const q=quantityFor(candidate,original.protein,"protein");const nutrition=calculateFoodNutrition(candidate,q);const score=Math.abs(nutrition.calories-original.calories)/Math.max(original.calories,100)+Math.abs(nutrition.protein-original.protein)/Math.max(original.protein,8);return{candidate,q,nutrition,score};}).filter((entry)=>entry.score<.45).sort((a,b)=>Number(a.candidate.estimatedCost)-Number(b.candidate.estimatedCost)||a.score-b.score)[0];
}

export async function generateDietPlan(userId: string) {
  const profile=await prisma.profile.findUnique({where:{userId},include:{fitnessGoals:{where:{isPrimary:true}}}});
  if(!profile||!profile.age||!profile.heightCm||!profile.currentWeightKg||!profile.activityLevel)throw new FitPlanError("INVALID_PROFILE","Complete your age, height, weight, activity level, and goal before creating a plan.");
  const goal=profile.fitnessGoals[0]?.category;if(!goal)throw new FitPlanError("INVALID_PROFILE","Choose a primary fitness goal before creating a plan.");
  const targets=calculateNutritionTargets({age:profile.age,sex:profile.sex,heightCm:Number(profile.heightCm),weightKg:Number(profile.currentWeightKg),activityLevel:profile.activityLevel,goal});
  const [restrictions,rawFoods,preferences,lastPlan]=await Promise.all([
    prisma.foodRestriction.findMany({where:{userId}}),
    prisma.food.findMany({orderBy:{name:"asc"}}),
    prisma.userFoodPreference.findMany({where:{userId}}),
    prisma.mealPlan.findFirst({where:{userId},orderBy:{version:"desc"},select:{version:true}}),
  ]);
  let safeFoods=rawFoods.filter((food)=>isFoodAllowed(food,profile.dietType,restrictions));
  const preferredFoods=safeFoods.filter((food)=>!isDislikedFood(food,restrictions));
  if(preferredFoods.length>=3)safeFoods=preferredFoods;
  if(safeFoods.length<3)throw new FitPlanError("INVALID_DIET_RESTRICTION","Not enough safe foods are available to create varied meals.",422);
  const likedIds=new Set(preferences.filter((p)=>p.liked).map((p)=>p.foodId));
  safeFoods=safeFoods.sort((a,b)=>Number(likedIds.has(b.id))-Number(likedIds.has(a.id)));
  const count=Math.min(6,Math.max(2,profile.mealsPerDay??3));const now=new Date();
  const days=Array.from({length:7},(_,offset)=>{const day=new Date(now);day.setDate(day.getDate()+offset);day.setHours(0,0,0,0);return buildMeals(day,count,safeFoods,targets,offset);});
  const currency=profile.budgetCurrency??safeFoods.find((food)=>food.currency)?.currency??"USD";
  const budget=profile.dailyBudget?Number(profile.dailyBudget):undefined;
  let foodsChanged=0;
  if(budget!==undefined){for(const meals of days){let cost=meals.reduce((s,m)=>s+m.totals.cost,0);const costly=meals.flatMap((m)=>m.items.map((item)=>({meal:m,item}))).sort((a,b)=>b.item.values.cost-a.item.values.cost);for(const entry of costly){if(cost<=budget)break;const replacement=chooseCheaperFood(entry.item.food,safeFoods);if(!replacement)continue;const old=entry.item.values;entry.item.food=replacement.candidate;entry.item.quantity=replacement.q;entry.item.values=replacement.nutrition;entry.meal.totals=sumFoods(entry.meal.items);cost+=replacement.nutrition.cost-old.cost;foodsChanged++;}}}
  const weekCost=round(days.flat().reduce((sum,meal)=>sum+meal.totals.cost,0));
  const mealsNested=days.flat().map((meal,index)=>({name:meal.name,type:meal.type,scheduledAt:meal.scheduledAt,sortOrder:index,caloriesTotal:round(meal.totals.calories),proteinTotal:round(meal.totals.protein),carbohydratesTotal:round(meal.totals.carbohydrates),fatTotal:round(meal.totals.fat),estimatedCost:round(meal.totals.cost),foods:{create:meal.items.map((item,sortOrder)=>({foodId:item.food.id,quantity:item.quantity,unit:item.food.servingUnit,sortOrder,calories:item.values.calories,protein:item.values.protein,carbohydrates:item.values.carbohydrates,fat:item.values.fat,fiber:item.values.fiber,estimatedCost:item.values.cost,currency:item.food.currency}))}}));
  return prisma.$transaction(async(tx)=>{
    const plan=await tx.mealPlan.create({data:{userId,name:"Personalized weekly meal plan",status:PlanStatus.ACTIVE,startsAt:now,endsAt:new Date(now.getTime()+6*86400_000),generatedAt:now,version:(lastPlan?.version??0)+1,targetCalories:targets.calories,targetProtein:targets.protein,targetCarbohydrates:targets.carbohydrates,targetFat:targets.fat,currency,totalEstimatedCost:weekCost,generationReason:`Built from profile goals and dietary constraints. ${foodsChanged} cost-aware food swaps applied where an affordable nutrition match was found. Targets are estimates.`,meals:{create:mealsNested}}});
    return {plan,targets,dailyTotals:days.map((meals,index)=>({date:meals[0]?.scheduledAt??now,dayNumber:index+1,...meals.reduce((sum,meal)=>({calories:sum.calories+meal.totals.calories,protein:sum.protein+meal.totals.protein,carbohydrates:sum.carbohydrates+meal.totals.carbohydrates,fat:sum.fat+meal.totals.fat,cost:sum.cost+meal.totals.cost}),{calories:0,protein:0,carbohydrates:0,fat:0,cost:0})})),withinBudget:budget===undefined||weekCost<=budget,estimatedDailyCost:round(weekCost/7),budget:budget??null,currency,notice:"Nutrition, food price, and calorie values are estimates."};
  });
}
