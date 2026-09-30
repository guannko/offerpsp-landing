-- Minimal legacy AIBot tables required before the ordered OfferPSP migrations.
-- New dedicated OfferPSP projects apply this bootstrap first. It intentionally
-- excludes every table, bucket and function belonging to other BIX products.

create table if not exists public.offerpsp_leads (
  lead_id uuid primary key default gen_random_uuid(),
  name text not null,
  work_email text not null,
  telegram text,
  company text not null,
  company_url text,
  vertical text not null,
  monthly_volume text,
  geos text not null,
  methods text,
  details text,
  source text,
  utm_source text,
  utm_campaign text,
  status text not null default 'new',
  consent boolean not null default false,
  submitted_at timestamptz not null default now()
);

create table if not exists public.psp_providers (
  id serial primary key,
  name text not null,
  website text,
  geo text,
  cluster text,
  specialization text,
  methods text,
  notes text,
  contact_status text default 'not_contacted',
  commission_terms text,
  email text,
  contact_name text,
  phone text,
  telegram text,
  linkedin text,
  other_contacts text,
  supported_countries text[] not null default '{}',
  supported_currencies text[] not null default '{}',
  payment_methods text[] not null default '{}',
  supported_verticals text[] not null default '{}',
  restricted_countries text[] not null default '{}',
  integration_types text[] not null default '{}',
  min_monthly_volume numeric,
  max_monthly_volume numeric,
  risk_appetite text,
  provider_status text default 'research',
  capabilities_verified_at timestamptz,
  capabilities_source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create sequence if not exists public.casino_leads_internal_seq start 1;

create table if not exists public.casino_leads (
  id serial primary key,
  internal_id text,
  name text not null,
  website text,
  description text,
  geo text,
  license text,
  software text,
  affiliate_program text,
  sphere text,
  email text,
  contact_name text,
  contact_title text,
  telegram text,
  phone text,
  linkedin text,
  contact_status text not null default 'new',
  score integer,
  source text,
  city text,
  emails_sent integer,
  last_contacted_at timestamptz,
  last_reply_at timestamptz,
  reply_status text,
  next_follow_up date,
  notes text,
  tags text[],
  enriched_emails jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (internal_id)
);

create table if not exists public.email_drafts (
  id bigserial primary key,
  chat_id text not null,
  lead_internal_id text,
  to_email text,
  subject text,
  body text,
  status text,
  created_at timestamptz default now()
);

create table if not exists public.chat_logs (
  id bigserial primary key,
  chat_id text not null,
  role text not null,
  message text not null,
  created_at timestamptz default now()
);

create table if not exists public.bot_tasks (
  id serial primary key,
  task_type text,
  payload jsonb,
  priority integer,
  scheduled_for timestamptz,
  status text,
  result text,
  error text,
  created_by text,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  ref_type text,
  ref_id text
);
