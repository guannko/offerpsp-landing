import type { EmailThread, Lead, WorkTask } from "../types/offerpsp";
import { isQaFixtureLead, isQaFixtureLeadId, isQaFixtureProviderId, isQaFixtureTask } from "./qaFixtures.ts";

const syntheticIdentity = (value: string) => /(^|[^a-z])e2e([^a-z]|$)|workspace-role|no action required/i.test(value);
export const isCourseBusinessLead = (lead: Lead) => !isQaFixtureLead(lead)
  && lead.record_state !== "archived" && !["spam", "closed", "lost"].includes(lead.status || "")
  && !syntheticIdentity([lead.company, lead.name, lead.work_email, lead.company_url].filter(Boolean).join(" "))
  && !String(lead.work_email || "").endsWith(".invalid");

export const isCourseBusinessTask = (task: WorkTask, excludedLeadIds: Set<string>) => !isQaFixtureTask(task)
  && !(task.lead_id && excludedLeadIds.has(task.lead_id))
  && !syntheticIdentity([task.title, task.details, task.automation_ref].filter(Boolean).join(" "));

export const isCourseBusinessThread = (thread: EmailThread, excludedLeadIds: Set<string>) => !isQaFixtureLeadId(thread.lead_id)
  && !(thread.lead_id && excludedLeadIds.has(thread.lead_id))
  && !(thread.counterparty_type === "merchant" && (isQaFixtureLeadId(thread.counterparty_id) || Boolean(thread.counterparty_id && excludedLeadIds.has(thread.counterparty_id))))
  && !(thread.counterparty_type === "provider" && isQaFixtureProviderId(thread.counterparty_id))
  && !["archived", "trashed"].includes(thread.status);
