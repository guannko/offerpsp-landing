-- A run claimed before the stable hash migration may still carry the legacy
-- full-row hash. Salvage only runs whose worker never acquired the job; no
-- evidence collection has started and the current applicant snapshot is safe.
update private.offerpsp_compliance_cases c
set screening_input_hash = private.offerpsp_pre_compliance_input_hash(l)
from public.offerpsp_leads l
where l.lead_id = c.lead_id
  and c.case_status = 'screening'
  and c.screening_run_id is not null
  and c.screening_dispatch_started_at is null
  and c.screening_lease_until > now()
  and l.record_state = 'active'
  and l.status not in ('closed', 'spam', 'won', 'lost')
  and c.screening_input_hash is distinct from private.offerpsp_pre_compliance_input_hash(l);
