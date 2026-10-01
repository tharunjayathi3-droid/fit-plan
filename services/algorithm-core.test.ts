import { describe,expect,it } from "vitest";
import { ActivityLevel, ExerciseDifficulty, Food, GoalCategory, MovementPattern, Prisma, Sex } from "@prisma/client";
import { calculateNutritionTargets } from "@/services/nutrition-service";
import { calculateFoodNutrition } from "@/services/food-service";
import { isFoodAllowed } from "@/services/dietary-safety";
import { exerciseSimilarityScore, nutritionSimilarityScore, selectMovementBalancedExercises, calculateProgressChange, assertUserOwns } from "@/services/algorithm-core";
import { optimizeDietBudget } from "@/services/budget-service";
import { profileInputSchema } from "@/lib/validation";
import { FitPlanError } from "@/lib/errors";

const sampleFood={id:"chicken",name:"Chicken breast",slug:"chicken",description:null,category:"PROTEIN" as const,servingSize:new Prisma.Decimal(100),servingUnit:"g",calories:new Prisma.Decimal(165),protein:new Prisma.Decimal(31),carbohydrates:new Prisma.Decimal(0),fat:new Prisma.Decimal(3.6),fiber:new Prisma.Decimal(0),estimatedCost:new Prisma.Decimal(1),currency:"USD",isVegetarian:false,isVegan:false,containsEgg:false,allergens:[],createdAt:new Date(),updatedAt:new Date()} as Food;

describe("nutrition calculations",()=>{
  it("uses Mifflin–St Jeor and returns positive macro targets as estimates",()=>{
    const result=calculateNutritionTargets({age:30,sex:Sex.MALE,heightCm:180,weightKg:80,activityLevel:ActivityLevel.MODERATELY_ACTIVE,goal:GoalCategory.MUSCLE_GAIN});
    expect(result.bmr).toBe(1780);expect(result.tdee).toBe(2759);expect(result.calories).toBeGreaterThan(result.tdee);expect(result.protein).toBe(144);expect(result.isEstimate).toBe(true);
  });
  it("scales each structured nutrition value in direct proportion to quantity",()=>{
    const twoHundred=calculateFoodNutrition(sampleFood,200);expect(twoHundred.calories).toBe(330);expect(twoHundred.protein).toBe(62);expect(twoHundred.cost).toBe(2);
  });
});

describe("dietary compatibility and ranking",()=>{
  const allergy=[{name:"peanuts",type:"ALLERGY" as const}];
  it("eliminates foods containing named allergens and honors vegan constraints",()=>{
    expect(isFoodAllowed({...sampleFood,allergens:["peanut"]},"NO_RESTRICTION",allergy)).toBe(false);
    expect(isFoodAllowed(sampleFood,"VEGAN",[])).toBe(false);
    expect(isFoodAllowed({...sampleFood,isVegan:true,isVegetarian:true},"VEGAN",[])).toBe(true);
  });
  it("ranks close macro matches ahead of nutritionally distant alternatives",()=>{
    const original={calories:250,protein:30,carbohydrates:5,fat:8,fiber:1,cost:2};
    const close={...original,cost:2.2};const distant={calories:400,protein:5,carbohydrates:55,fat:14,fiber:2,cost:1};
    expect(nutritionSimilarityScore(original,close)).toBeGreaterThan(nutritionSimilarityScore(original,distant));
  });
});

describe("budget optimization",()=>{
  it("reduces cost with a nutritionally compatible cheaper replacement",()=>{
    const plan={budget:3,foods:[{foodId:"a",name:"Premium tofu",quantity:100,calories:150,protein:18,carbohydrates:5,fat:8,cost:4,replaceWith:{foodId:"b",name:"Tofu",quantity:110,calories:165,protein:19,carbohydrates:6,fat:8,cost:2}}]};
    const result=optimizeDietBudget(plan,3);expect(result.newCost).toBe(2);expect(result.withinBudget).toBe(true);expect(result.changes).toHaveLength(1);
  });
});

describe("exercise alternatives and workout constraints",()=>{
  it("scores same-muscle, same-pattern alternatives more highly",()=>{
    const source={primaryMuscle:"Chest",secondaryMuscles:["Triceps"],movementPattern:MovementPattern.HORIZONTAL_PUSH,difficulty:ExerciseDifficulty.INTERMEDIATE};
    const match={...source,difficulty:ExerciseDifficulty.BEGINNER};const mismatch={...source,primaryMuscle:"Back"};
    expect(exerciseSimilarityScore(source,match,2)).toBeGreaterThan(exerciseSimilarityScore(source,mismatch,2));
  });
  it("avoids duplicate movement patterns while filling a workout day",()=>{
    const candidates=[{id:"press",primaryMuscle:"Chest",secondaryMuscles:[],movementPattern:MovementPattern.HORIZONTAL_PUSH},{id:"press2",primaryMuscle:"Chest",secondaryMuscles:[],movementPattern:MovementPattern.HORIZONTAL_PUSH},{id:"row",primaryMuscle:"Back",secondaryMuscles:[],movementPattern:MovementPattern.HORIZONTAL_PULL},{id:"squat",primaryMuscle:"Quadriceps",secondaryMuscles:[],movementPattern:MovementPattern.SQUAT}];
    const selected=selectMovementBalancedExercises(candidates,["Chest","Back","Quadriceps"],4);expect(selected.map((item)=>item.id)).toEqual(["press","row","squat"]);expect(new Set(selected.map((item)=>item.movementPattern)).size).toBe(selected.length);
  });
});

describe("progress, ownership, and API input validation",()=>{
  it("calculates weight changes to one decimal place",()=>expect(calculateProgressChange(73.24,72.45)).toBe(-0.8));
  it("rejects records owned by a different user",()=>{expect(()=>assertUserOwns("user-b","user-a")).toThrowError(FitPlanError);expect(()=>assertUserOwns("user-a","user-a")).not.toThrow();});
  it("rejects out-of-range profile values and half-specified budget currency",()=>{
    expect(profileInputSchema.safeParse({name:"A",age:12,heightCm:170,currentWeightKg:65}).success).toBe(false);
    expect(profileInputSchema.safeParse({name:"A",dailyBudget:20}).success).toBe(false);
    expect(profileInputSchema.safeParse({name:"A",age:30,heightCm:170,currentWeightKg:65,dailyBudget:20,budgetCurrency:"USD",workoutDaysPerWeek:4}).success).toBe(true);
  });
});
