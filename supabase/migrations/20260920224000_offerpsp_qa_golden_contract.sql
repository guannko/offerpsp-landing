-- Turn synthetic QA fixtures into a durable golden contract, not a cosmetic
-- record pair. The status RPC verifies the minimum complete merchant and PSP
-- paths that production is expected to preserve.

create or replace function public.list_offerpsp_qa_fixture_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_scenario record;
  v_merchant_count bigint;
  v_provider_count bigint;
  v_merchant_contact_count bigint;
  v_provider_contact_count bigint;
  v_complete_merchant_count bigint;
  v_complete_provider_count bigint;
  v_published_route_count bigint;
  v_complete_route_count bigint;
  v_eligible_match_count bigint;
  v_exact_match_count bigint;
  v_isolation_enforced boolean;
  v_healthy boolean;
  v_entities jsonb;
  v_checks jsonb;
  v_issues text[];
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select
    exists (
      select 1 from pg_trigger
      where tgname = 'tg_offerpsp_enforce_route_match_qa_scenario'
        and not tgisinternal
    )
    and exists (
      select 1 from pg_trigger
      where tgname = 'tg_offerpsp_enforce_shortlist_qa_scenario'
        and not tgisinternal
    )
  into v_isolation_enforced;

  for v_scenario in
    select distinct scenario_key
    from private.offerpsp_qa_fixture_entities
    order by scenario_key
  loop
    select
      count(*) filter (where entity_type = 'merchant'),
      count(*) filter (where entity_type = 'provider'),
      jsonb_agg(
        jsonb_build_object(
          'entity_type', entity_type,
          'entity_id', entity_id,
          'label', label
        ) order by entity_type, label
      )
    into v_merchant_count, v_provider_count, v_entities
    from private.offerpsp_qa_fixture_entities
    where scenario_key = v_scenario.scenario_key;

    select count(*)
    into v_merchant_contact_count
    from private.offerpsp_merchant_contacts contact
    where contact.active
      and contact.lead_id in (
        select entity_id
        from private.offerpsp_qa_fixture_entities
        where scenario_key = v_scenario.scenario_key
          and entity_type = 'merchant'
      );

    select count(*)
    into v_complete_merchant_count
    from private.offerpsp_qa_fixture_entities fixture
    join public.offerpsp_leads lead on lead.lead_id = fixture.entity_id
    where fixture.scenario_key = v_scenario.scenario_key
      and fixture.entity_type = 'merchant'
      and nullif(trim(lead.company), '') is not null
      and nullif(trim(lead.company_url), '') is not null
      and nullif(trim(lead.name), '') is not null
      and nullif(trim(lead.work_email), '') is not null
      and nullif(trim(lead.vertical), '') is not null
      and cardinality(lead.target_geos) > 0
      and cardinality(lead.requested_currencies) > 0
      and cardinality(lead.requested_flows) > 0
      and cardinality(lead.requested_methods) > 0
      and cardinality(lead.traffic_types) > 0
      and lead.expected_monthly_volume is not null
      and nullif(trim(lead.volume_currency), '') is not null
      and nullif(trim(lead.transaction_currency), '') is not null
      and nullif(trim(lead.business_model), '') is not null
      and lead.license_status in ('licensed', 'not_required')
      and (
        lead.license_status <> 'licensed'
        or (
          nullif(trim(lead.license_jurisdiction), '') is not null
          and nullif(trim(lead.license_number), '') is not null
          and nullif(trim(lead.license_evidence_url), '') is not null
        )
      );

    select count(*)
    into v_provider_contact_count
    from private.offerpsp_provider_contacts contact
    where contact.active
      and contact.provider_id in (
        select entity_id
        from private.offerpsp_qa_fixture_entities
        where scenario_key = v_scenario.scenario_key
          and entity_type = 'provider'
      );

    select count(*)
    into v_complete_provider_count
    from private.offerpsp_qa_fixture_entities fixture
    join private.offerpsp_providers provider on provider.id = fixture.entity_id
    join public.offerpsp_provider_profile_details details on details.provider_id = provider.id
    where fixture.scenario_key = v_scenario.scenario_key
      and fixture.entity_type = 'provider'
      and nullif(trim(provider.legal_name), '') is not null
      and nullif(trim(provider.brand_name), '') is not null
      and nullif(trim(provider.website), '') is not null
      and provider.relationship_status = 'active'
      and provider.last_verified_at is not null
      and nullif(trim(details.company_description), '') is not null
      and nullif(trim(details.headquarters_country), '') is not null
      and cardinality(details.operating_geos) > 0
      and cardinality(details.supported_currencies) > 0
      and cardinality(details.payment_methods) > 0
      and cardinality(details.supported_verticals) > 0
      and jsonb_array_length(details.licences) > 0
      and nullif(trim(details.compliance_summary), '') is not null
      and nullif(trim(details.onboarding_requirements), '') is not null;

    select
      count(*) filter (where route.status = 'published'),
      count(*) filter (
        where route.status = 'published'
          and batch.status = 'published'
          and cardinality(route.geos) > 0
          and cardinality(route.currencies) > 0
          and cardinality(route.methods) > 0
          and cardinality(route.traffic_types) > 0
          and cardinality(route.verticals) > 0
          and cardinality(route.risk_segments) > 0
          and nullif(trim(route.operational_notes), '') is not null
          and exists (
            select 1
            from private.offerpsp_offer_fee_components fee
            where fee.route_id = route.id
          )
      )
    into v_published_route_count, v_complete_route_count
    from private.offerpsp_offer_routes route
    join private.offerpsp_rate_card_batches batch on batch.id = route.batch_id
    where route.provider_id in (
      select entity_id
      from private.offerpsp_qa_fixture_entities
      where scenario_key = v_scenario.scenario_key
        and entity_type = 'provider'
    );

    select
      count(*) filter (where route_match.eligibility = 'eligible'),
      count(*) filter (
        where route_match.eligibility = 'eligible'
          and route_match.score >= 90
          and route_match.hard_gates ->> 'qa_scenario_key' = v_scenario.scenario_key
          and jsonb_typeof(route_match.pricing_snapshot) = 'array'
          and jsonb_array_length(route_match.pricing_snapshot) > 0
          and jsonb_typeof(route_match.risks) = 'array'
          and jsonb_array_length(route_match.risks) = 0
      )
    into v_eligible_match_count, v_exact_match_count
    from private.offerpsp_route_matches route_match
    where route_match.lead_id in (
      select entity_id
      from private.offerpsp_qa_fixture_entities
      where scenario_key = v_scenario.scenario_key
        and entity_type = 'merchant'
    )
      and route_match.provider_id in (
        select entity_id
        from private.offerpsp_qa_fixture_entities
        where scenario_key = v_scenario.scenario_key
          and entity_type = 'provider'
      );

    v_healthy := v_merchant_count > 0
      and v_provider_count > 0
      and v_complete_merchant_count = v_merchant_count
      and v_complete_provider_count = v_provider_count
      and v_merchant_contact_count >= v_merchant_count * 2
      and v_provider_contact_count >= v_provider_count
      and v_complete_route_count > 0
      and v_exact_match_count > 0
      and v_isolation_enforced;

    v_issues := array_remove(array[
      case when v_merchant_count = 0 then 'Эталонный мерчант не зарегистрирован' end,
      case when v_complete_merchant_count <> v_merchant_count then 'Анкета эталонного мерчанта заполнена не полностью' end,
      case when v_merchant_count > 0 and v_merchant_contact_count < v_merchant_count * 2 then 'Не проверена работа с несколькими контактами мерчанта' end,
      case when v_provider_count = 0 then 'Эталонный PSP не зарегистрирован' end,
      case when v_complete_provider_count <> v_provider_count then 'Профиль эталонного PSP заполнен не полностью' end,
      case when v_provider_count > 0 and v_provider_contact_count < v_provider_count then 'У эталонного PSP нет активного контакта' end,
      case when v_complete_route_count = 0 then 'Нет полного опубликованного коммерческого маршрута' end,
      case when v_exact_match_count = 0 then 'Нет точного детерминированного совпадения с рассчитанной ценой' end,
      case when not v_isolation_enforced then 'Защитная изоляция QA и production не установлена' end
    ]::text[], null);

    v_checks := jsonb_build_array(
      jsonb_build_object(
        'key', 'merchant_template',
        'label', 'Мерчант: полная анкета и несколько сотрудников',
        'passed', v_merchant_count > 0
          and v_complete_merchant_count = v_merchant_count
          and v_merchant_contact_count >= v_merchant_count * 2,
        'detail', format('%s профилей · %s контактов', v_complete_merchant_count, v_merchant_contact_count)
      ),
      jsonb_build_object(
        'key', 'provider_template',
        'label', 'PSP: полный профиль, лицензия и рабочий контакт',
        'passed', v_provider_count > 0
          and v_complete_provider_count = v_provider_count
          and v_provider_contact_count >= v_provider_count,
        'detail', format('%s профилей · %s контактов', v_complete_provider_count, v_provider_contact_count)
      ),
      jsonb_build_object(
        'key', 'published_supply',
        'label', 'Оффер: опубликованный маршрут, тариф и ограничения',
        'passed', v_complete_route_count > 0,
        'detail', format('%s полных маршрутов', v_complete_route_count)
      ),
      jsonb_build_object(
        'key', 'deterministic_match',
        'label', 'Matching: точное совпадение с рассчитанной ценой',
        'passed', v_exact_match_count > 0,
        'detail', format('%s точных совпадений', v_exact_match_count)
      ),
      jsonb_build_object(
        'key', 'production_isolation',
        'label', 'Безопасность: QA не смешивается с реальными компаниями',
        'passed', v_isolation_enforced,
        'detail', case when v_isolation_enforced then 'Два DB-ограничителя активны' else 'Ограничители отсутствуют' end
      )
    );

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'scenario_key', v_scenario.scenario_key,
      'contract_version', 1,
      'healthy', v_healthy,
      'merchant_count', v_merchant_count,
      'provider_count', v_provider_count,
      'merchant_contact_count', v_merchant_contact_count,
      'provider_contact_count', v_provider_contact_count,
      'published_route_count', v_published_route_count,
      'eligible_match_count', v_eligible_match_count,
      'checks', v_checks,
      'issues', to_jsonb(v_issues),
      'entities', coalesce(v_entities, '[]'::jsonb)
    ));
  end loop;

  return v_result;
end;
$$;

revoke all on function public.list_offerpsp_qa_fixture_status() from public, anon;
grant execute on function public.list_offerpsp_qa_fixture_status() to authenticated, service_role;

comment on function public.list_offerpsp_qa_fixture_status() is
  'Returns staff-only golden-contract status for isolated synthetic merchant and PSP workflow fixtures.';
