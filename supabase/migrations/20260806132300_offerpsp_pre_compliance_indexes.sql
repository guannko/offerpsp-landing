create index if not exists offerpsp_compliance_cases_decided_by_idx
  on private.offerpsp_compliance_cases(decided_by);

create index if not exists offerpsp_compliance_decisions_actor_user_idx
  on private.offerpsp_compliance_decisions(actor_user_id);

create index if not exists offerpsp_module_entitlements_module_key_idx
  on private.offerpsp_module_entitlements(module_key);
