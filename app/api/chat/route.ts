import { ChatRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, jsonBody } from "@/lib/api";
import { FitPlanError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { aiProvider } from "@/services/ai-provider";
import { aiTools, runUserTool } from "@/services/ai-tools-service";
import { rateLimit } from "@/lib/rate-limit";

const schema=z.object({conversationId:z.string().min(1).optional(),message:z.string().trim().min(1).max(4000)});
const safeJson=(value:unknown)=>JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==="bigint"?item.toString():item));
export async function GET(request:Request){try{const user=await requireUser();const id=new URL(request.url).searchParams.get("conversationId");if(id){const conversation=await prisma.chatConversation.findFirst({where:{id,userId:user.id},include:{messages:{orderBy:{createdAt:"asc"},take:100}}});if(!conversation)throw new FitPlanError("NOT_FOUND","Conversation was not found.",404);return NextResponse.json({conversation});}const conversations=await prisma.chatConversation.findMany({where:{userId:user.id},orderBy:{updatedAt:"desc"},take:30,include:{messages:{orderBy:{createdAt:"desc"},take:1}}});return NextResponse.json({conversations});}catch(error){return apiError(error);}}
export async function POST(request:Request){
  try{
    const user=await requireUser();rateLimit(`chat:${user.id}`,30,60_000);const input=schema.parse(await jsonBody(request));
    let conversation=input.conversationId?await prisma.chatConversation.findFirst({where:{id:input.conversationId,userId:user.id}}):null;
    if(input.conversationId&&!conversation)throw new FitPlanError("NOT_FOUND","Conversation was not found.",404);
    if(!conversation)conversation=await prisma.chatConversation.create({data:{userId:user.id,title:input.message.slice(0,100)}});
    await prisma.chatMessage.create({data:{conversationId:conversation.id,role:ChatRole.USER,content:input.message}});
    const history=await prisma.chatMessage.findMany({where:{conversationId:conversation.id},orderBy:{createdAt:"desc"},take:12});
    const profile=await prisma.profile.findUnique({where:{userId:user.id},select:{name:true}});
    const messages=[{role:"system" as const,content:`You are FitPlan Coach, a practical and supportive fitness companion for ${profile?.name??"the user"}. Keep replies concise. Use the provided tools for profile-specific facts, food/exercise replacements, progress, and targets. Never invent calories, macros, food costs, allergens, or exercise database facts; never calculate nutrition yourself. Nutrition values and plans are estimates. Do not diagnose, infer body composition from images, or promise physique outcomes. Only invoke generatePlanAdjustment when the user clearly requests an updated plan. User data is private; tools expose only the signed-in user's records.`},...history.reverse().map((message)=>({role:message.role.toLowerCase() as "user"|"assistant",content:message.content}))];
    const answer=await aiProvider.generateResponse(messages,aiTools(),(name,args)=>runUserTool(user.id,name,args));
    const saved=await prisma.$transaction(async(tx)=>{const message=await tx.chatMessage.create({data:{conversationId:conversation!.id,role:ChatRole.ASSISTANT,content:answer}});await tx.chatConversation.update({where:{id:conversation!.id},data:{updatedAt:new Date()}});return message;});
    return NextResponse.json({conversationId:conversation.id,message:saved});
  }catch(error){return apiError(error);}
}
