export type MerchantNextAction = {
  action: "none" | "wait_screening" | "review_decision" | "review_dossier" | "wait_client" | "review_shortlist" | "matching";
  blocked: boolean;
  tab: "company" | "compliance" | "communications" | "preview" | "matching";
  detail: string;
};
export function merchantNextAction(input: {
  leadStatus?: string | null;
  recordState?: string | null;
  complianceStatus?: string | null;
  shortlistStatus?: string | null;
  hasMatches?: boolean;
}): MerchantNextAction;
