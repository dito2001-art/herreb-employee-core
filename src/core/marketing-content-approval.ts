import type { GroundedContentDraft } from "./marketing-content";
export type ContentApprovalStatus="DRAFT"|"APPROVED"|"PUBLISH_READY";
export interface ControlledContent extends Omit<GroundedContentDraft,"status">{status:ContentApprovalStatus;approvedBy?:string;approvedAt?:string;approvalEvidenceRef?:string;}
export function approveGroundedContent(draft:GroundedContentDraft,input:{tenantId:string;approvedBy:string;approvedAt:string;approvalEvidenceRef:string}):ControlledContent{
 if(draft.tenantId!==input.tenantId) throw new Error("CONTENT_APPROVAL_TENANT_MISMATCH");
 if(!input.approvedBy.trim()||!input.approvedAt.trim()||!input.approvalEvidenceRef.trim()) throw new Error("CONTENT_APPROVAL_EVIDENCE_REQUIRED");
 return {...draft,status:"APPROVED",approvedBy:input.approvedBy,approvedAt:input.approvedAt,approvalEvidenceRef:input.approvalEvidenceRef};
}
export function markContentPublishReady(content:ControlledContent):ControlledContent{
 if(content.status!=="APPROVED"||!content.approvedBy||!content.approvalEvidenceRef) throw new Error("CONTENT_APPROVAL_REQUIRED");
 return {...content,status:"PUBLISH_READY"};
}
