create index if not exists offerpsp_intake_submissions_contact_idx
  on private.offerpsp_intake_submissions(contact_id)
  where contact_id is not null;

create index if not exists offerpsp_leads_identity_domain_idx
  on public.offerpsp_leads(private.offerpsp_normalize_domain(company_url))
  where status <> 'spam' and company_url is not null;

create index if not exists offerpsp_leads_identity_company_idx
  on public.offerpsp_leads(private.offerpsp_normalize_company_name(company))
  where status <> 'spam' and company is not null;
