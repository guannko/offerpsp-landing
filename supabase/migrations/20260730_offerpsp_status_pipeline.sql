alter table public.offerpsp_leads
  drop constraint if exists offerpsp_leads_status_allowed;

alter table public.offerpsp_leads
  add constraint offerpsp_leads_status_allowed
  check (
    status in (
      'new',
      'reviewing',
      'qualified',
      'matched',
      'closed',
      'spam',
      'qualifying',
      'matching',
      'shortlist_ready',
      'shared',
      'negotiating',
      'won',
      'lost'
    )
  );
