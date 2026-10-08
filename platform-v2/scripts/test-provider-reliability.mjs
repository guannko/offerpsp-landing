import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { blankReliabilityPoints, reliabilityScore, reliabilityCoverage, resolveProviderReliability, providerInReliabilityScope } from '../src/lib/providerReliability.ts';

test('scores are bounded evidence points; unknown is not zero evidence', () => {
  assert.equal(reliabilityScore(blankReliabilityPoints), 0);
  assert.equal(reliabilityCoverage(blankReliabilityPoints), 0);
  const points = { legal: 25, funds: null, operations: 10, reputation: 5, transparency: 5 };
  assert.equal(reliabilityScore(points), 45);
  assert.equal(reliabilityCoverage(points), 75);
  assert.equal(reliabilityCoverage({ ...points, funds: 0 }), 100);
  for (const legal of [-1, 26, 0.5, NaN, undefined]) assert.throws(() => reliabilityScore({ ...points, legal }));
});

test('deferred category is disjoint from lifecycle groups; all/history retain it', () => {
  const deferred = { category: 'review_later' };
  for (const kind of ['active', 'pipeline', 'inactive']) {
    assert.equal(providerInReliabilityScope(kind, false, kind, deferred), false);
    assert.equal(providerInReliabilityScope('review_later', false, kind, deferred), true);
    assert.equal(providerInReliabilityScope(kind, false, kind), true);
  }
  assert.equal(providerInReliabilityScope('all', false, 'pipeline', deferred), true);
  assert.equal(providerInReliabilityScope('review_later', true, 'pipeline', deferred), false);
  assert.equal(providerInReliabilityScope('hidden', true, 'pipeline', deferred), true);
  assert.equal(providerInReliabilityScope('all', true, 'pipeline', deferred), true);
});

test('canonical assessment overrides only the explicitly linked research assessment', () => {
  const research = { entity_type: 'research_psp', entity_id: '19' };
  const other = { entity_type: 'research_psp', entity_id: '63' };
  const canonical = { entity_type: 'provider', entity_id: 'provider-one' };
  assert.equal(resolveProviderReliability([research, other], 'provider-one', 19), research);
  assert.equal(resolveProviderReliability([research, other], 'provider-one'), undefined);
  assert.equal(resolveProviderReliability([research, other, canonical], 'provider-one', 19), canonical);
});

test('proposed initial ratings keep unresolved identities and never claim application', async () => {
  const preview = JSON.parse(await readFile(new URL('../../artifacts/psp-reliability-proposed-20261009.json', import.meta.url), 'utf8'));
  assert.equal(preview.status, 'approved_not_applied');
  assert.deepEqual(preview.items.map((item) => reliabilityScore(item.payload.points)), [35, 45, 40, 35, 65]);
  assert.deepEqual(preview.items.filter((item) => item.entity_id === null).map((item) => item.name), ['Inpay', 'Finrax']);
  assert.equal(preview.items.find((item) => item.name === 'DECTA').payload.decision, 'pending');
  assert.equal(preview.items.filter((item) => item.payload.category === 'review_later').length, 4);
});

test('real PostgreSQL migration: permissions, validation, scoring, stale edits and audit', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('00000000-0000-0000-0000-000000000001');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.user_id',true),'')::uuid
      $$;
      create function public.is_offerpsp_staff() returns boolean language sql stable as $$
        select coalesce(current_setting('test.staff',true),'false')='true'
      $$;
      create function private.offerpsp_confirmation_session_id() returns text language sql stable as $$
        select coalesce(current_setting('test.session',true),'session-one')
      $$;
      create table private.offerpsp_providers(id uuid primary key, relationship_status text, brand_name text, website text);
      insert into private.offerpsp_providers values ('00000000-0000-0000-0000-000000000002','active','Canonical PSP','https://canonical.example');
      create table public.psp_providers(id serial primary key, provider_status text, contact_status text, name text, website text);
      insert into public.psp_providers values (19,'research','replied','PayOp','https://payop.com');
      create table private.offerpsp_entity_audit(entity_type text, entity_id text, action_type text, actor_user_id uuid, before_state jsonb, after_state jsonb);
      create function public.save_offerpsp_research_entity(p_type text,p_id bigint,p_payload jsonb) returns jsonb language plpgsql as $$
        declare result public.psp_providers;
        begin
          insert into public.psp_providers(name,website,provider_status,contact_status)
          values(p_payload->>'name',p_payload->>'website',p_payload->>'provider_status',p_payload->>'contact_status') returning * into result;
          return to_jsonb(result);
        end;
      $$;
      grant usage on schema public to anon,authenticated;
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261008213708_offerpsp_provider_reliability.sql', import.meta.url), 'utf8'));
    const payload = { category: 'review_later', decision: 'conditional', confidence: 'low', points: { legal: 15, funds: null, operations: 10, reputation: 5, transparency: 5 }, scope: 'High-risk PSP partnership', reason: 'Further KYB required', next_step: 'Get signed partner contract', sources: ['https://example.com/evidence'], score: 99 };
    const save = (value = payload, expected = null, type = 'research_psp', id = '19') => db.query('select public.save_offerpsp_provider_reliability($1,$2,$3::jsonb,$4::timestamptz) as assessment', [type, id, JSON.stringify(value), expected]);
    await db.exec('set role anon');
    await assert.rejects(db.query('select public.get_offerpsp_provider_reliability()'), /permission denied/);
    await assert.rejects(save(), /permission denied/);
    await db.exec("reset role; set test.user_id='00000000-0000-0000-0000-000000000001'; set test.staff='false'; set role authenticated");
    await assert.rejects(db.query('select public.get_offerpsp_provider_reliability()'), /staff access required/);
    await assert.rejects(save(), /staff access required/);
    await db.exec("set test.staff='true'; set test.user_id=''");
    await assert.rejects(save(), /staff access required/);
    await db.exec("set test.user_id='00000000-0000-0000-0000-000000000001'");
    await assert.rejects(db.query('select * from private.offerpsp_provider_reliability'), /permission denied/);
    for (const value of [null, [], {}, { ...payload, points: {} }, { ...payload, points: { ...payload.points, legal: 26 } }, { ...payload, points: { ...payload.points, legal: 1.5 } }, { ...payload, points: { ...payload.points, legal: -1 } }, { ...payload, points: { ...payload.points, legal: '15' } }, { ...payload, points: { ...payload.points, unknown: 0 } }, { ...payload, sources: [] }, { ...payload, sources: ['http://example.com'] }, { ...payload, sources: ['https://secret@example.com'] }, { ...payload, category: 'bad' }, { ...payload, reason: '' }]) await assert.rejects(save(value));
    await assert.rejects(save(payload, null, 'research_psp', '999'), /not found/);
    await assert.rejects(save({ ...payload, points: blankReliabilityPoints }), /At least one criterion/);
    await assert.rejects(save({ ...payload, sources: ['https://user:password@example.com'] }), /Public HTTPS sources required/);
    const saved = (await save()).rows[0].assessment;
    assert.equal(saved.score, 35, 'client-supplied score cannot override points');
    assert.equal(saved.points.funds, null);
    assert.equal(saved.category, 'review_later');
    await assert.rejects(save(), /Assessment changed/);
    const updated = (await save({ ...payload, category: 'working' }, saved.updated_at)).rows[0].assessment;
    assert.equal(updated.category, 'working');
    await assert.rejects(save(payload, saved.updated_at), /Assessment changed/);
    const rows = (await db.query('select public.get_offerpsp_provider_reliability() as assessments')).rows[0].assessments;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].score, 35);
    await save(payload, null, 'provider', '00000000-0000-0000-0000-000000000002');
    await db.exec('reset role');
    assert.deepEqual((await db.query('select provider_status,contact_status from public.psp_providers')).rows[0], { provider_status: 'research', contact_status: 'replied' });
    assert.equal((await db.query('select relationship_status from private.offerpsp_providers')).rows[0].relationship_status, 'active');
    const history = (await db.query('select * from private.offerpsp_entity_audit')).rows;
    assert.equal(history.length, 3);
    assert.equal(history[0].before_state, null);
    assert.equal(history[1].before_state.category, 'review_later');
    assert.equal(history[1].after_state.category, 'working');

    await db.exec('set role authenticated');
    const existing = { name: 'PayOp', website: 'https://payop.com', entity_type: 'research_psp', entity_id: '19', payload };
    const missing = { name: 'Finrax', website: 'https://finrax.com', entity_type: 'research_psp', entity_id: null, payload };
    const prepare = async (items) => (await db.query('select public.prepare_offerpsp_provider_reliability_batch($1::jsonb) as preview', [JSON.stringify(items)])).rows[0].preview;
    const confirm = async (token) => (await db.query('select public.confirm_offerpsp_provider_reliability_batch($1::uuid) as receipt', [token])).rows[0].receipt;
    await assert.rejects(prepare([{ ...existing, name: 'B2BinPay' }]), /identity mismatch/);
    await assert.rejects(prepare([existing, existing]), /Duplicate batch/);
    await assert.rejects(prepare([{ ...missing, name: 'PayOp' }]), /already exists/);
    let preview = await prepare([missing, existing]);
    assert.equal(preview.status, 'pending');
    assert.equal(preview.preview[0].create_research, true);
    assert.equal(preview.preview[1].score, 35);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from public.psp_providers')).rows[0].n, 1, 'prepare cannot create cards');
    assert.equal((await db.query('select count(*)::int as n from private.offerpsp_entity_audit')).rows[0].n, 3, 'prepare cannot change assessments');
    await db.exec("set role authenticated; set test.session='session-two'");
    await assert.rejects(confirm(preview.confirmation_token), /another staff session/);
    await db.exec("set test.session='session-one'");
    // Default helper returned session-one before the first explicit setting.
    await db.exec("reset role; update public.psp_providers set contact_status='negotiating' where id=19; set role authenticated");
    await assert.rejects(confirm(preview.confirmation_token), /changed after preview/);
    await db.exec('reset role');
    assert.equal((await db.query("select count(*)::int as n from public.psp_providers where name='Finrax'")).rows[0].n, 0, 'failed last item rolls back earlier new-card creation');
    await db.exec('set role authenticated');
    preview = await prepare([existing, missing]);
    const receipt = await confirm(preview.confirmation_token);
    assert.equal(receipt.status, 'executed');
    assert.equal(receipt.assessments.length, 2);
    assert.equal((await confirm(preview.confirmation_token)).status, 'already_executed');
    await db.exec('reset role');
    assert.equal((await db.query("select count(*)::int as n from public.psp_providers where name='Finrax'")).rows[0].n, 1);
    assert.equal((await db.query('select contact_status from public.psp_providers where id=19')).rows[0].contact_status, 'negotiating');
    await db.exec('set role authenticated');
    const expiring = await prepare([existing]);
    await db.exec('reset role');
    await db.query("update private.offerpsp_reliability_confirmations set expires_at=clock_timestamp()-interval '1 second' where id=$1", [expiring.confirmation_token]);
    await db.exec('set role authenticated');
    assert.equal((await confirm(expiring.confirmation_token)).status, 'expired');
    await assert.rejects(db.query('select * from private.offerpsp_reliability_confirmations'), /permission denied/);
    await db.exec("set test.staff='false'");
    await assert.rejects(prepare([existing]), /staff access required/);
    await assert.rejects(confirm(preview.confirmation_token), /staff access required/);
  } finally { await db.close(); }
});
