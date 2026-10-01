import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
export async function GET(){
  try {
    const user=await requireUser();
    const plans=await prisma.workoutPlan.findMany({where:{userId:user.id},orderBy:{version:"desc"},take:10,include:{days:{orderBy:{scheduledOn:"asc"},include:{exercises:{orderBy:{sortOrder:"asc"},include:{exercise:{include:{equipment:{include:{equipment:true}}}},sets:true}}}}}});
    return NextResponse.json({plans,active:plans[0]??null});
  }catch(error){return apiError(error);}
}
