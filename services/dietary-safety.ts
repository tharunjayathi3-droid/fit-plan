import type { Food, FoodRestriction } from "@prisma/client";

const aliasGroups=[["peanut","peanuts","groundnut"],["milk","dairy","lactose","casein","whey"],["shellfish","shrimp","prawn","crab","lobster"],["tree nut","almond","walnut","cashew","pistachio","hazelnut"],["gluten","wheat","barley","rye"],["soy","soya","tofu"],["egg","eggs"],["fish","salmon","tuna"]];
export function canonicalTerms(value:string){const normalized=value.trim().toLowerCase();return aliasGroups.find((group)=>group.some((term)=>normalized.includes(term)||term.includes(normalized)))??[normalized];}
export function isFoodAllowed(food:Pick<Food,"name"|"allergens"|"isVegan"|"isVegetarian">,diet:string,restrictions:Pick<FoodRestriction,"name"|"type">[]){
 if(diet==="VEGAN"&&!food.isVegan)return false;
 if((diet==="VEGETARIAN"||diet==="EGGETARIAN")&&!food.isVegetarian)return false;
 const hard=restrictions.filter((restriction)=>["ALLERGY","INTOLERANCE","CANNOT_EAT"].includes(restriction.type));
 const foodTerms=[food.name,...food.allergens].flatMap(canonicalTerms);
 return !hard.some((restriction)=>canonicalTerms(restriction.name).some((term)=>foodTerms.includes(term)||food.name.toLowerCase().includes(restriction.name.toLowerCase())||restriction.name.toLowerCase().includes(food.name.toLowerCase())));
}
export function isDislikedFood(food:Pick<Food,"name">,restrictions:Pick<FoodRestriction,"name"|"type">[]){return restrictions.filter((restriction)=>restriction.type==="DISLIKE").some((restriction)=>food.name.toLowerCase().includes(restriction.name.toLowerCase()));}
