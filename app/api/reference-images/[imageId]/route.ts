import { unlink } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { FitPlanError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
export const runtime="nodejs";
export async function DELETE(_request:Request,context:{params:Promise<{imageId:string}>}){try{const user=await requireUser();const {imageId}=await context.params;const image=await prisma.referenceImage.findFirst({where:{id:imageId,userId:user.id}});if(!image)throw new FitPlanError("NOT_FOUND","Reference image was not found.",404);const root=path.resolve(process.env.FITPLAN_UPLOAD_DIR??path.join(process.cwd(),".private-uploads"));const target=path.resolve(root,image.storageKey);if(!target.startsWith(`${root}${path.sep}`))throw new FitPlanError("VALIDATION_ERROR","Invalid image storage key.");await unlink(target).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error;});await prisma.referenceImage.delete({where:{id:image.id}});return NextResponse.json({ok:true});}catch(error){return apiError(error);}}
