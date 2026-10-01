import { FitPlanError } from "@/lib/errors";

export type AIMessage = { role: "system"|"user"|"assistant"|"tool"; content: string|null; tool_call_id?: string; tool_calls?: Array<{id:string;type:"function";function:{name:string;arguments:string}}> };
export type AITool = { type:"function"; function:{name:string;description:string;parameters:Record<string,unknown>} };
export interface AIProvider {
  generateResponse(messages:AIMessage[],tools?:AITool[],execute?:(name:string,args:unknown)=>Promise<unknown>):Promise<string>;
  generateStructuredPlan<T>(messages:AIMessage[],validate:(value:unknown)=>T):Promise<T>;
  analyzeUserRequest(message:string):Promise<{intent:string;entities:Record<string,string>}>;
}

/** OpenAI-compatible chat provider. The API key remains server-side and can be switched by changing env config. */
export class OpenAICompatibleProvider implements AIProvider {
  private endpoint=(process.env.AI_BASE_URL??"https://api.openai.com/v1").replace(/\/$/,"");
  private key=process.env.AI_API_KEY;
  private model=process.env.AI_MODEL??"gpt-4o-mini";
  private async request(messages:AIMessage[],tools?:AITool[]) {
    if(!this.key)throw new FitPlanError("AI_SERVICE_UNAVAILABLE","AI Coach is not configured yet. Set AI_API_KEY on the server.",503);
    const response=await fetch(`${this.endpoint}/chat/completions`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${this.key}`},body:JSON.stringify({model:this.model,messages,temperature:.2,...(tools?.length?{tools,tool_choice:"auto"}:{})}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new FitPlanError("AI_SERVICE_UNAVAILABLE","AI Coach is temporarily unavailable. Please try again.",503);
    return response.json() as Promise<{choices:Array<{message:{content:string|null;tool_calls?:AIMessage["tool_calls"]}}>}>;
  }
  async generateResponse(messages:AIMessage[],tools:AITool[]=[],execute?: (name:string,args:unknown)=>Promise<unknown>) {
    const conversation=[...messages];
    for(let turn=0;turn<4;turn++){
      const response=await this.request(conversation,tools);const message=response.choices[0]?.message;
      if(!message)throw new FitPlanError("AI_SERVICE_UNAVAILABLE","AI Coach returned no response.",503);
      const calls=message.tool_calls??[];
      if(!calls.length)return message.content??"I couldn't put together a response. Please try asking another way.";
      if(!execute)throw new FitPlanError("AI_SERVICE_UNAVAILABLE","AI tools are unavailable for this request.",503);
      conversation.push({role:"assistant",content:message.content,tool_calls:calls});
      for(const call of calls){
        let result:unknown;
        try{result=await execute(call.function.name,JSON.parse(call.function.arguments));}catch(error){result={error:error instanceof Error?error.message:"The requested action could not be completed."};}
        conversation.push({role:"tool",tool_call_id:call.id,content:JSON.stringify(result)});
      }
    }
    throw new FitPlanError("AI_SERVICE_UNAVAILABLE","AI Coach could not complete the request. Please try a simpler question.",503);
  }
  async generateStructuredPlan<T>(messages:AIMessage[],validate:(value:unknown)=>T):Promise<T>{
    const result=await this.request(messages);const text=result.choices[0]?.message.content;if(!text)throw new FitPlanError("AI_SERVICE_UNAVAILABLE","AI Coach returned no structured response.",503);
    try{return validate(JSON.parse(text));}catch{throw new FitPlanError("AI_SERVICE_UNAVAILABLE","AI Coach response did not match the required structure.",503);}
  }
  async analyzeUserRequest(message:string){
    const result=await this.generateStructuredPlan([{role:"system",content:"Classify the user request into a short intent and named entities. Return only JSON: {intent:string,entities:Record<string,string>. Do not calculate nutrition or invent facts."},{role:"user",content:message}],(value)=>{if(!value||typeof value!=="object"||!("intent" in value)||!("entities" in value))throw new Error("invalid");return value as {intent:string;entities:Record<string,string>};});return result;
  }
}
export const aiProvider:AIProvider=new OpenAICompatibleProvider();
