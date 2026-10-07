import { KnowledgeRecordSchema, type KnowledgeRecord } from "./knowledge";
import { MarketingInsightSchema, type MarketingInsight } from "./marketing";

export interface MarketingResearchInput {
 id:string;
 tenantId:string;
 subject:string;
 summary:string;
 sourceRefs:string[];
 researchedAt:string;
 confidence:number;
 audienceId?:string;
}

export function createRetrievedMarketingResearch(input:MarketingResearchInput):KnowledgeRecord{
 if(input.sourceRefs.length===0) throw new Error("RESEARCH_SOURCE_REQUIRED");
 return KnowledgeRecordSchema.parse({
  id:input.id,tenantId:input.tenantId,namespace:`${input.tenantId}:marketing-research`,
  kind:"RETRIEVED",subject:input.subject,content:{summary:input.summary},
  sourceRefs:[...new Set(input.sourceRefs)],confidence:input.confidence,verified:false,updatedAt:input.researchedAt
 });
}

export function researchToMarketingInsight(record:KnowledgeRecord,input:{audienceId?:string;hypothesis:string;learnedAt:string}):MarketingInsight{
 if(record.kind!=="RETRIEVED") throw new Error("RETRIEVED_RESEARCH_REQUIRED");
 if(record.sourceRefs.length===0) throw new Error("RESEARCH_SOURCE_REQUIRED");
 return MarketingInsightSchema.parse({
  id:`research:${record.id}`,tenantId:record.tenantId,audienceId:input.audienceId,
  hypothesis:input.hypothesis,evidenceRefs:record.sourceRefs,confidence:record.confidence ?? 0,learnedAt:input.learnedAt
 });
}
