-- ONLY used by verify-current-recovery-pack.mjs after network/port isolation checks.
-- Fresh fixture; no rewrite of the approved production QA request. All mutations roll back.
BEGIN;
SET LOCAL plpgsql.check_asserts=on;
DO $$ BEGIN
  ASSERT current_user='recovery_operator','Fixture requires the isolated recovery role';
  ASSERT current_setting('cron.launch_active_jobs')='off','Cron must be disabled';
  ASSERT current_setting('pg_net.database_name')='template1','HTTP worker must be isolated from restored queues';
END $$;
-- Test membership decisions only. Outbound wake-up configuration is explicitly
-- neutralized in this rolled-back local fixture; this is NOT a Vault recovery pass.
UPDATE private.offerpsp_screening_dispatch_config SET enabled=false,secret_id=NULL;
CREATE TEMP TABLE rejection_fixture(lead_id uuid,organization_id uuid,owner_id uuid,applicant_id uuid,request_id uuid);
GRANT SELECT ON rejection_fixture TO authenticated;
DO $$
DECLARE owner_id uuid; applicant_id uuid; org_id uuid:=gen_random_uuid(); lead_id uuid:=gen_random_uuid(); v_submission_id uuid:=gen_random_uuid(); source public.offerpsp_leads; request_id uuid;
BEGIN
  SELECT id INTO STRICT owner_id FROM auth.users WHERE email='hello@brain-index.com' AND email_confirmed_at IS NOT NULL;
  SELECT id INTO STRICT applicant_id FROM auth.users WHERE email='bizdev@offerpsp.com' AND email_confirmed_at IS NOT NULL;
  ASSERT NOT EXISTS(SELECT FROM public.offerpsp_staff_members WHERE user_id IN(owner_id,applicant_id) AND active),'QA identities must not be staff';
  SELECT * INTO STRICT source FROM public.offerpsp_leads WHERE company='OfferPSP Intake E2E 20261001 — NO ACTION REQUIRED';
  INSERT INTO public.offerpsp_organizations(id,organization_type,name,created_by)
  VALUES(org_id,'merchant','OfferPSP rejection QA — NO ACTION REQUIRED',owner_id);
  INSERT INTO public.offerpsp_organization_members(organization_id,user_id,role,created_by)
  VALUES(org_id,owner_id,'owner',owner_id);
  INSERT INTO public.offerpsp_leads SELECT (jsonb_populate_record(NULL::public.offerpsp_leads,to_jsonb(source)||jsonb_build_object(
    'lead_id',lead_id,'company','OfferPSP rejection QA — NO ACTION REQUIRED','status','new','record_state','active',
    'merchant_organization_id',org_id,'client_user_id',owner_id,'archived_at',NULL,'archived_by',NULL,'merged_into_id',NULL))).*;
  INSERT INTO private.offerpsp_intake_submissions(id,lead_id,request_hash,disposition,match_strategy,submitted_name,submitted_email,submitted_company,payload)
  VALUES(v_submission_id,lead_id,gen_random_uuid()::text,'review_required','isolated_rejection_fixture',
    'Boris QA rejection — NO ACTION REQUIRED','bizdev@offerpsp.com','OfferPSP rejection QA — NO ACTION REQUIRED','{}');
  SELECT j.id INTO STRICT request_id FROM private.offerpsp_company_join_requests j WHERE j.submission_id=v_submission_id;
  INSERT INTO rejection_fixture VALUES(lead_id,org_id,owner_id,applicant_id,request_id);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',applicant_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',applicant_id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE f rejection_fixture; j jsonb;
BEGIN
  SELECT * INTO STRICT f FROM rejection_fixture;
  PERFORM public.claim_offerpsp_leads();
  ASSERT NOT public.can_access_offerpsp_client_lead(f.lead_id),'Applicant gained access before approval';
  SELECT value INTO STRICT j FROM jsonb_array_elements(public.get_offerpsp_company_join_requests()) WHERE value->>'id'=f.request_id::text;
  ASSERT j->>'status'='pending_owner' AND NOT (j->>'can_decide')::boolean,'Pending state incorrect';
  BEGIN
    PERFORM public.decide_offerpsp_company_join_request(f.request_id,true,'viewer');
    RAISE EXCEPTION 'Applicant self-approval unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Company owner/admin approval required%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$ DECLARE f rejection_fixture; BEGIN
  SELECT * INTO STRICT f FROM rejection_fixture;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f.owner_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',f.owner_id::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE f rejection_fixture; j jsonb; decision jsonb;
BEGIN
  SELECT * INTO STRICT f FROM rejection_fixture;
  SELECT value INTO STRICT j FROM jsonb_array_elements(public.get_offerpsp_company_join_requests()) WHERE value->>'id'=f.request_id::text;
  ASSERT (j->>'can_decide')::boolean,'Owner cannot decide';
  decision:=public.decide_offerpsp_company_join_request(f.request_id,false,'viewer');
  ASSERT decision->>'status'='rejected' AND NOT (decision->>'replayed')::boolean,'Initial rejection failed';
  decision:=public.decide_offerpsp_company_join_request(f.request_id,false,'viewer');
  ASSERT (decision->>'replayed')::boolean,'Rejection replay guard failed';
  BEGIN
    PERFORM public.decide_offerpsp_company_join_request(f.request_id,true,'viewer');
    RAISE EXCEPTION 'Opposite decision unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Join request already decided%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$ DECLARE f rejection_fixture; BEGIN
  SELECT * INTO STRICT f FROM rejection_fixture;
  ASSERT NOT EXISTS(SELECT FROM public.offerpsp_organization_members WHERE organization_id=f.organization_id AND user_id=f.applicant_id),'Rejected membership created';
  ASSERT NOT EXISTS(SELECT FROM private.offerpsp_merchant_contacts WHERE lead_id=f.lead_id AND email='bizdev@offerpsp.com'),'Rejected contact created';
  ASSERT (SELECT count(*) FROM private.offerpsp_entity_audit WHERE action_type='company_join_decided' AND after_state->>'request_id'=f.request_id::text)=1,'Decision journal not exactly once';
  ASSERT (SELECT status FROM private.offerpsp_company_join_requests WHERE id='cdc1c7ff-981e-4ed3-83a2-7237fad494e7')='approved','Previous approved QA history changed';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f.applicant_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',f.applicant_id::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE f rejection_fixture; j jsonb; BEGIN
  SELECT * INTO STRICT f FROM rejection_fixture;
  PERFORM public.claim_offerpsp_leads();
  ASSERT NOT public.can_access_offerpsp_client_lead(f.lead_id),'Rejected applicant gained access after claim';
  SELECT value INTO STRICT j FROM jsonb_array_elements(public.get_offerpsp_company_join_requests()) WHERE value->>'id'=f.request_id::text;
  ASSERT j->>'status'='rejected' AND NOT (j->>'can_decide')::boolean,'Rejected applicant status incorrect';
END $$;
RESET ROLE;
SELECT jsonb_build_object('status','PASS','scope','restored production DB with new rolled-back fixture; not live browser E2E','cases',jsonb_build_array('pending access denied','self approval denied','owner rejection','repeat idempotent','opposite decision denied','no membership/contact','one decision event','reclaim remains denied','approved history preserved'));
ROLLBACK;
