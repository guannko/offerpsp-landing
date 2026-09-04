create table if not exists private.offerpsp_introduction_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text not null,
  channel text not null check (channel in ('telegram', 'zoom')),
  language text not null check (language in ('ru', 'en')),
  title_template text not null,
  body_template text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_code, channel, language)
);

create table if not exists private.offerpsp_introduction_preparations (
  id uuid primary key default gen_random_uuid(),
  provider_review_id uuid not null references private.offerpsp_provider_reviews(id) on delete cascade,
  language text not null check (language in ('ru', 'en')),
  preparation jsonb not null,
  prepared_by uuid references auth.users(id) on delete set null,
  prepared_at timestamptz not null default now(),
  unique (provider_review_id, language)
);

drop trigger if exists offerpsp_introduction_templates_set_updated_at
  on private.offerpsp_introduction_templates;
create trigger offerpsp_introduction_templates_set_updated_at
before update on private.offerpsp_introduction_templates
for each row execute function public.set_offerpsp_updated_at();

insert into private.offerpsp_introduction_templates(
  template_code, channel, language, title_template, body_template
) values
  (
    'managed_introduction', 'telegram', 'ru',
    '{{merchant}} × {{psp}} | OfferPSP',
    E'Коллеги, знакомлю {{merchant}} и {{psp}}.\n\nМерч: {{merchant}}\nКонтакт: {{merchant_contact}}\nЗапрос: {{route}}\nGEO: {{geos}}\nМетоды: {{methods}}\n\nPSP: {{psp}}\nКонтакт: {{psp_contact}}\n\nПредлагаю здесь согласовать детали и назначить короткий Zoom. Я остаюсь в чате и помогу довести запуск до результата.'
  ),
  (
    'managed_introduction', 'telegram', 'en',
    '{{merchant}} × {{psp}} | OfferPSP',
    E'Colleagues, introducing {{merchant}} and {{psp}}.\n\nMerchant: {{merchant}}\nContact: {{merchant_contact}}\nRequest: {{route}}\nGEO: {{geos}}\nMethods: {{methods}}\n\nPSP: {{psp}}\nContact: {{psp_contact}}\n\nPlease use this group to align the details and schedule a short Zoom call. I will stay involved and help move the launch to a result.'
  ),
  (
    'managed_introduction', 'zoom', 'ru',
    '{{merchant}} × {{psp}} — подключение платежей',
    E'Повестка на 30 минут:\n1. Профиль мерча и целевые GEO.\n2. Маршрут {{route}}: методы, лимиты и коммерческие условия.\n3. Compliance и необходимые документы.\n4. Техническая интеграция и сроки теста.\n5. Ответственные и следующий контрольный шаг.'
  ),
  (
    'managed_introduction', 'zoom', 'en',
    '{{merchant}} × {{psp}} — payment onboarding',
    E'30-minute agenda:\n1. Merchant profile and target GEOs.\n2. Route {{route}}: methods, limits and commercial terms.\n3. Compliance and required documents.\n4. Technical integration and testing timeline.\n5. Owners and the next follow-up step.'
  )
on conflict (template_code, channel, language) do nothing;

create or replace function private.offerpsp_render_template(
  p_template text,
  p_context jsonb
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_result text := p_template;
  v_key text;
begin
  for v_key in select jsonb_object_keys(p_context)
  loop
    v_result := replace(v_result, '{{' || v_key || '}}', coalesce(p_context ->> v_key, '—'));
  end loop;
  return v_result;
end;
$$;

create or replace function public.prepare_offerpsp_introduction(
  p_review_id uuid,
  p_language text default 'ru'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_review private.offerpsp_provider_reviews;
  v_dossier private.offerpsp_merchant_dossiers;
  v_provider private.offerpsp_providers;
  v_route private.offerpsp_offer_routes;
  v_contact private.offerpsp_provider_contacts;
  v_telegram private.offerpsp_introduction_templates;
  v_zoom private.offerpsp_introduction_templates;
  v_context jsonb;
  v_pack jsonb;
  v_language text := lower(trim(coalesce(p_language, 'ru')));
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if v_language not in ('ru', 'en') then raise exception 'Language must be ru or en'; end if;

  select * into v_review
  from private.offerpsp_provider_reviews
  where id = p_review_id and status = 'accepted';
  if not found then raise exception 'Accepted PSP review is required'; end if;

  select * into v_dossier from private.offerpsp_merchant_dossiers where id = v_review.dossier_id;
  select * into v_provider from private.offerpsp_providers where id = v_review.provider_id;
  select * into v_route from private.offerpsp_offer_routes where id = v_review.route_id;
  select * into v_contact
  from private.offerpsp_provider_contacts
  where provider_id = v_review.provider_id and active
  order by (preferred_channel = 'telegram') desc, created_at
  limit 1;

  select * into v_telegram from private.offerpsp_introduction_templates
  where template_code = 'managed_introduction' and channel = 'telegram'
    and language = v_language and active;
  select * into v_zoom from private.offerpsp_introduction_templates
  where template_code = 'managed_introduction' and channel = 'zoom'
    and language = v_language and active;
  if v_telegram.id is null or v_zoom.id is null then raise exception 'Active introduction templates not found'; end if;

  v_context := jsonb_build_object(
    'merchant', coalesce(v_dossier.brand_name, v_dossier.legal_name, 'Merchant'),
    'merchant_contact', concat_ws(' · ', nullif(v_dossier.contact_name, ''), nullif(v_dossier.contact_telegram, ''), nullif(v_dossier.contact_email, '')),
    'psp', v_provider.brand_name,
    'psp_contact', case when v_contact.id is null then 'Contact to be added' else concat_ws(' · ', v_contact.full_name, nullif(v_contact.telegram, ''), nullif(v_contact.email, '')) end,
    'route', v_route.client_title,
    'geos', coalesce(array_to_string(v_route.geos, ', '), '—'),
    'methods', coalesce(array_to_string(v_route.methods, ', '), '—')
  );

  v_pack := jsonb_build_object(
    'review_id', v_review.id,
    'language', v_language,
    'telegram', jsonb_build_object(
      'group_title', private.offerpsp_render_template(v_telegram.title_template, v_context),
      'message', private.offerpsp_render_template(v_telegram.body_template, v_context)
    ),
    'zoom', jsonb_build_object(
      'meeting_title', private.offerpsp_render_template(v_zoom.title_template, v_context),
      'agenda', private.offerpsp_render_template(v_zoom.body_template, v_context)
    ),
    'participants', jsonb_build_object(
      'merchant', jsonb_build_object('name', v_dossier.contact_name, 'telegram', v_dossier.contact_telegram, 'email', v_dossier.contact_email),
      'provider', jsonb_build_object('name', v_contact.full_name, 'telegram', v_contact.telegram, 'email', v_contact.email)
    ),
    'checklist', case when v_language = 'ru' then jsonb_build_array(
      'Создать общую Telegram-группу', 'Добавить мерча и PSP', 'Отправить подготовленное знакомство',
      'Согласовать Zoom', 'Зафиксировать ссылки в Deal Desk'
    ) else jsonb_build_array(
      'Create a shared Telegram group', 'Add the merchant and PSP', 'Send the prepared introduction',
      'Agree on a Zoom slot', 'Record both links in Deal Desk'
    ) end
  );

  insert into private.offerpsp_introduction_preparations(
    provider_review_id, language, preparation, prepared_by, prepared_at
  ) values (v_review.id, v_language, v_pack, auth.uid(), now())
  on conflict (provider_review_id, language) do update
  set preparation = excluded.preparation,
      prepared_by = auth.uid(),
      prepared_at = now();

  return v_pack;
end;
$$;

revoke all on private.offerpsp_introduction_templates from public, anon, authenticated;
revoke all on private.offerpsp_introduction_preparations from public, anon, authenticated;
grant all on private.offerpsp_introduction_templates to service_role;
grant all on private.offerpsp_introduction_preparations to service_role;

revoke all on function public.prepare_offerpsp_introduction(uuid,text) from public, anon;
grant execute on function public.prepare_offerpsp_introduction(uuid,text) to authenticated;

comment on function public.prepare_offerpsp_introduction(uuid,text) is
  'Builds and stores the staff-only Telegram/Zoom introduction pack after PSP acceptance.';
