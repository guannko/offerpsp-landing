import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const rpc=async(name,value)=> (await db.query(`select public.${name}(${value === undefined ? '' : '$1'}) result`,value === undefined ? [] : [value])).rows[0].result;
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema cron;
    create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('11111111-1111-4111-8111-111111111111');
    create function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
    create function public.is_offerpsp_staff() returns boolean language sql as $$ select current_setting('test.staff',true)='true' $$;
    select set_config('test.staff','true',false);
    create table public.offerpsp_leads(lead_id uuid,company text,record_state text,status text,source_platform text,
      source_category text,source_referrer text,utm_source text,utm_medium text,utm_campaign text,gclid text,gbraid text,wbraid text,
      dclid text,msclkid text,fbclid text,li_fat_id text,ttclid text,affiliate_id text,affiliate_click_id text,submitted_at timestamptz,landing_path text);
    create function private.offerpsp_is_qa_lead(public.offerpsp_leads) returns boolean language sql as $$ select coalesce($1.company,'')='QA' $$;
    create table private.offerpsp_deal_outcomes(lead_id uuid,result text,integration_status text,actual_monthly_volume numeric);
    create table private.offerpsp_conversion_events(lead_id uuid,google_export_status text);
    create table public.offerpsp_seo_audit_runs(id uuid primary key default gen_random_uuid(),status text,trigger_source text,requested_by uuid,
      requested_at timestamptz default now(),started_at timestamptz,completed_at timestamptz,technical_audit_id uuid,error_message text,metadata jsonb default '{}');
    insert into public.offerpsp_leads(lead_id,company,source_category,source_platform,utm_source,submitted_at) values
      (gen_random_uuid(),'Real ChatGPT','campaign','chatgpt.com','chatgpt.com',now()),
      (gen_random_uuid(),'QA','campaign','chatgpt.com','chatgpt.com',now());
    insert into public.offerpsp_seo_audit_runs(status,requested_at) values ('running',now()-interval '17 days');
  `);
  for(const name of ['20261001085616_offerpsp_seo_geo_integrity.sql','20261001090334_offerpsp_geo_observation_evidence.sql'])
    await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  assert.equal((await rpc('get_offerpsp_acquisition_funnel')).totals.paid_leads,0);
  await db.exec(`insert into public.offerpsp_leads(company,utm_medium,submitted_at) values ('Paid','cpc',now());`);
  assert.equal((await rpc('get_offerpsp_acquisition_funnel')).totals.paid_leads,1);
  const run=await rpc('request_offerpsp_seo_audit');
  assert.equal(run.reused,false);
  assert.equal((await rpc('request_offerpsp_seo_audit')).id,run.id);
  assert.equal((await rpc('reserve_offerpsp_scheduled_seo_audit')).id,run.id);
  assert.equal((await db.query("select status from public.offerpsp_seo_audit_runs where requested_at<now()-interval '1 day'")).rows[0].status,'failed');
  await assert.rejects(()=>db.exec("insert into public.offerpsp_seo_audit_runs(status) values('queued')"),/unique/);
  const observation={engine:'gemini',language:'en',country:'US',prompt:'Which PSP matching platforms?',
    response_text:'OfferPSP is mentioned in this isolated test response.',observed_at:new Date().toISOString(),citations:['https://offerpsp.com.evil.test/']};
  let saved=await rpc('record_offerpsp_geo_observation',observation);
  assert.equal(saved.brand_mentioned,true); assert.equal(saved.site_cited,false);
  assert.equal((await rpc('record_offerpsp_geo_observation',observation)).id,saved.id);
  saved=await rpc('record_offerpsp_geo_observation',{...observation,citations:['https://offerpsp.com/psp-for-igaming.html']});
  assert.equal(saved.site_cited,true);
  const results=await rpc('get_offerpsp_geo_observations');
  assert.equal(results.totals.checks,2); assert.equal(results.totals.citations,1);
  await assert.rejects(()=>rpc('record_offerpsp_geo_observation',{...observation,citations:['javascript:alert(1)']}),/HTTPS/);
  await db.exec("select set_config('test.staff','false',false)");
  for(const name of ['get_offerpsp_geo_observations','get_offerpsp_acquisition_funnel','request_offerpsp_seo_audit'])
    await assert.rejects(()=>rpc(name),/Staff access/);
  await assert.rejects(()=>rpc('record_offerpsp_geo_observation',observation),/Staff access/);
  for(const role of ['anon','authenticated','service_role']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(()=>db.exec('select * from private.offerpsp_geo_observations'),/permission denied/);
    if(role !== 'service_role') await assert.rejects(()=>rpc('reserve_offerpsp_scheduled_seo_audit'),/permission denied/);
    await db.exec('reset role');
  }
  console.log('PASS actual SQL paid attribution, QA exclusion, shared reservation, stale recovery, single active index, GEO evidence deduplication/domain checks and role isolation');
} finally {await db.close();}
