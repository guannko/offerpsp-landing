import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { copyWorkDocument, createDocumentBlock, documentFromBackup, documentPlainText, moveDocumentBlock, newWorkDocument, safeDocumentUrl, validateWorkDocument } from '../src/lib/workDocuments.ts';
import { appendDocumentTemplate, createDocumentFromTemplate, documentTemplates } from '../src/lib/documentTemplates.ts';

const migration = await readFile(new URL('../../supabase/migrations/20261001174709_offerpsp_workspace_documents.sql', import.meta.url), 'utf8');
const courseMigration = await readFile(new URL('../../supabase/migrations/20261001165903_offerpsp_course_organizer.sql', import.meta.url), 'utf8');
const staff = '00000000-0000-4000-8000-000000000001';
const outsider = '00000000-0000-4000-8000-000000000002';
const client = '00000000-0000-4000-8000-000000000011';
const provider = '00000000-0000-4000-8000-000000000012';
const claims = (id = staff, email = 'guannko@gmail.com', login = 'google') => ({ sub: id, email, role: 'authenticated', app_metadata: { provider: login } });
async function withDb(fn) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema private; create schema auth;
      create table auth.users(id uuid primary key); insert into auth.users values ('${staff}'),('${outsider}');
      create table public.offerpsp_staff_members(user_id uuid primary key,active boolean); insert into public.offerpsp_staff_members values ('${staff}',true);
      create table public.offerpsp_leads(lead_id uuid primary key); insert into public.offerpsp_leads values ('${client}');
      create table public.offerpsp_tasks(id uuid primary key);
      create table private.offerpsp_providers(id uuid primary key); insert into private.offerpsp_providers values ('${provider}');
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
      create function public.is_offerpsp_staff() returns boolean language sql stable security definer set search_path=public as $$
        select coalesce(auth.jwt()->>'role','')='service_role' or (lower(coalesce(auth.jwt()->>'email',''))='guannko@gmail.com'
          and coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
          and exists(select 1 from public.offerpsp_staff_members where user_id=auth.uid() and active=true)) $$;`);
    await db.exec(courseMigration); await db.exec(migration);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims())]);
    await fn(db);
  } finally { await db.close(); }
}
const save = async (db, doc) => (await db.query('select public.save_offerpsp_work_document($1,$2,$3::jsonb) result', [doc.id, doc.revision, JSON.stringify(doc.body)])).rows[0].result;
const get = async (db, id, revision = null) => (await db.query('select public.get_offerpsp_work_document($1,$2) result', [id, revision])).rows[0].result;
const list = async (db, offset = 0) => (await db.query('select public.list_offerpsp_work_documents($1) result', [offset])).rows[0].result;

test('blank, note and contract templates are valid drafts, not pre-agreed legal terms', () => {
  for (const kind of ['document', 'note', 'contract']) {
    const doc = newWorkDocument(kind); assert.equal(validateWorkDocument(doc.body), null); assert.equal(doc.revision, 0); assert.equal(doc.body.source, null);
  }
  assert.ok(newWorkDocument('contract').body.blocks.filter((b) => b.type === 'text').every((b) => b.text === ''));
});
test('first save, editing, exact reopen and historical versions are atomic', () => withDb(async (db) => {
  assert.deepEqual(await list(db), { documents: [], total: 0 });
  const draft = newWorkDocument('note'); draft.body.blocks[0].text = 'Original note';
  const first = await save(db, draft); assert.equal(first.outcome, 'saved'); assert.equal(first.revision, 1);
  const second = await save(db, { ...first, body: { ...first.body, title: 'Updated note' } });
  assert.equal(second.revision, 2);
  assert.equal((await get(db, draft.id)).body.title, 'Updated note');
  const old = await get(db, draft.id, 1); assert.equal(old.body.title, draft.body.title); assert.equal(old.current_revision, 2); assert.equal(old.history.length, 2);
  await assert.rejects(get(db, outsider), /document not found/); await assert.rejects(get(db, draft.id, 9), /version not found/);
  assert.equal((await list(db)).documents[0].body, undefined); // library never loads full contract bodies
}));
test('stale create/update cannot overwrite document or append a history entry', () => withDb(async (db) => {
  const draft = newWorkDocument('document'); const saved = await save(db, draft);
  assert.equal((await save(db, draft)).outcome, 'conflict');
  await save(db, { ...saved, body: { ...saved.body, title: 'Newer' } });
  assert.equal((await save(db, saved)).outcome, 'conflict'); assert.equal((await get(db, draft.id)).body.title, 'Newer');
  assert.equal((await get(db, draft.id)).history.length, 2);
}));
test('source can be attached once; later working edits preserve immutable source and history', () => withDb(async (db) => {
  let doc = await save(db, newWorkDocument('contract'));
  doc = await save(db, { ...doc, body: { ...doc.body, source: { label: 'Original', text: 'Original clause', url: 'https://example.test/contract' } } });
  const changed = { ...doc, body: { ...doc.body, blocks: [{ ...createDocumentBlock('text'), text: 'Working clause' }] } };
  const next = await save(db, changed); assert.equal(next.body.source.text, 'Original clause');
  await assert.rejects(save(db, { ...next, body: { ...next.body, source: null } }), /source snapshot is immutable/);
  await assert.rejects(save(db, { ...next, body: { ...next.body, source: { ...next.body.source, text: 'Overwrite' } } }), /source snapshot is immutable/);
  const copy = copyWorkDocument(next); const copied = await save(db, copy); assert.notEqual(copied.id, next.id); assert.equal(copied.revision, 1);
  assert.equal((await get(db, next.id)).revision, 3); assert.equal((await get(db, next.id, 2)).body.source.text, 'Original clause');
}));
test('all block types round-trip without HTML execution; ordering and copies are independent', () => withDb(async (db) => {
  const draft = newWorkDocument('document');
  draft.body.blocks = ['text', 'heading', 'list', 'checklist', 'table', 'callout', 'link'].map(createDocumentBlock);
  draft.body.blocks[0].text = '<script>alert(1)</script>';
  draft.body.blocks.at(-1).url = 'https://example.test/file';
  assert.equal(validateWorkDocument(draft.body), null); const saved = await save(db, draft);
  assert.deepEqual((await get(db, draft.id)).body, saved.body);
  const moved = moveDocumentBlock(draft.body.blocks, draft.body.blocks[0].id, 1);
  assert.equal(moved[1].id, draft.body.blocks[0].id); assert.notEqual(moved, draft.body.blocks);
  const copy = copyWorkDocument(saved); copy.body.blocks[0].text = 'Separate'; assert.notEqual(saved.body.blocks[0].text, 'Separate');
  assert.ok(documentPlainText(saved.body).includes('<script>alert(1)</script>')); // plain data, React renderer escapes it
  assert.equal(safeDocumentUrl('javascript:alert(1)'), false); assert.equal(safeDocumentUrl('data:text/html,test'), false);
}));
test('client, PSP and existing string direction links are verified, not fuzzy guesses', () => withDb(async (db) => {
  await db.query('select public.save_offerpsp_course_plan(0,$1::jsonb)', [JSON.stringify({ course: 'Course', directions: [{ id: 'cis', title: 'CIS', outcome: 'Outcome', paused: false, lead_ids: [], task_ids: [] }] })]);
  const draft = newWorkDocument('note'); draft.body.links = { lead_id: client, provider_id: provider, direction_id: 'cis' };
  assert.equal(validateWorkDocument(draft.body), null); const saved = await save(db, draft); assert.deepEqual(saved.body.links, draft.body.links);
  for (const key of ['lead_id', 'provider_id', 'direction_id']) {
    const forged = { ...saved, body: { ...saved.body, links: { ...saved.body.links, [key]: key === 'direction_id' ? 'missing' : outsider } } };
    await assert.rejects(save(db, forged), /linked .* not found/);
  }
  assert.equal((await db.query('select count(*)::int n from public.offerpsp_tasks')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from public.offerpsp_leads')).rows[0].n, 1);
}));
test('front and server reject malformed structures, unsafe URLs, oversized and duplicate blocks', () => withDb(async (db) => {
  const body = newWorkDocument('document').body;
  const invalid = [null, [], {}, { ...body, schema_version: 2 }, { ...body, title: '' }, { ...body, extra: 'hidden' },
    { ...body, blocks: Array(101).fill(body.blocks[0]) }, { ...body, blocks: [body.blocks[0], body.blocks[0]] },
    { ...body, blocks: [{ ...body.blocks[0], text: 'x'.repeat(50001) }] },
    { ...body, source: { label: 'Source', text: '', url: 'javascript:alert(1)' } },
    { ...body, blocks: [{ ...createDocumentBlock('link'), url: 'file:///private/contract' }] },
    { ...body, blocks: [{ ...createDocumentBlock('table'), rows: [['a'], ['b', 'c']] }] },
    { ...body, blocks: [{ ...createDocumentBlock('table'), rows: [[]] }] },
    { ...body, blocks: [{ ...createDocumentBlock('checklist'), items: [{ text: '', checked: 'yes' }] }] },
    { ...body, links: { lead_id: null, provider_id: null } },
    { ...body, links: { ...body.links, direction_id: 'bad direction /' } },
    { ...body, source: { label: 'Source', text: 'x'.repeat(200001), url: '' } },
  ];
  for (const payload of invalid) {
    assert.ok(validateWorkDocument(payload), JSON.stringify(payload).slice(0, 100));
    await assert.rejects(save(db, { id: newWorkDocument('note').id, revision: 0, body: payload }));
  }
  assert.equal((await list(db)).total, 0);
}));
test('anonymous, merchant, wrong provider/email and revoked staff cannot read any document data', () => withDb(async (db) => {
  const draft = newWorkDocument('note'); await save(db, draft);
  for (const jwt of [{}, claims(outsider), claims(staff, 'other@test.invalid'), claims(staff, 'guannko@gmail.com', 'email'), { role: 'service_role' }]) {
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(jwt)]);
    await assert.rejects(list(db), /staff access required/); await assert.rejects(get(db, draft.id), /staff access required/); await assert.rejects(save(db, draft), /staff access required/);
  }
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims())]); await db.exec('update public.offerpsp_staff_members set active=false');
  await assert.rejects(get(db, draft.id), /staff access required/);
}));
test('private tables have RLS, no direct grants; RPCs check staff and use empty search_path', () => withDb(async (db) => {
  for (const table of ['offerpsp_work_documents', 'offerpsp_work_document_history']) {
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`private.${table}`])).rows[0].relrowsecurity, true);
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await db.query('select has_table_privilege($1,$2,\'SELECT\') allowed', [role, `private.${table}`])).rows[0].allowed, false);
  }
  const signatures = ['public.list_offerpsp_work_documents(integer)', 'public.get_offerpsp_work_document(uuid,integer)', 'public.save_offerpsp_work_document(uuid,integer,jsonb)'];
  for (const fn of signatures) {
    for (const role of ['anon', 'service_role']) assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed', [role, fn])).rows[0].allowed, false);
    const info = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [fn])).rows[0]; assert.equal(info.prosecdef, true); assert.deepEqual(info.proconfig, ['search_path=""']);
  }
  await db.exec('set role authenticated'); assert.equal((await save(db, newWorkDocument('note'))).outcome, 'saved');
  await assert.rejects(db.query('select * from private.offerpsp_work_documents'), /permission denied/);
  await assert.rejects(db.query("select private.validate_offerpsp_work_document('{}')"), /permission denied/);
  await db.exec('reset role; set role anon'); await assert.rejects(list(db), /permission denied/);
}));
test('document library paginates all saved records and rejects invalid offsets', () => withDb(async (db) => {
  for (let index = 0; index < 51; index++) await save(db, newWorkDocument('note'));
  const first = await list(db); const second = await list(db, 50);
  assert.equal(first.documents.length, 50); assert.equal(second.documents.length, 1); assert.equal(first.total, 51);
  assert.equal(new Set([...first.documents, ...second.documents].map((doc) => doc.id)).size, 51);
  await assert.rejects(list(db, -1), /invalid offset/);
}));
test('UI uses staff RPCs, honest file limits and loss protection; no HTML injection or external sends', async () => {
  const editor = await readFile(new URL('../src/components/control/WorkDocumentDesk.tsx', import.meta.url), 'utf8');
  const repository = await readFile(new URL('../src/lib/workDocumentRepository.ts', import.meta.url), 'utf8');
  assert.match(editor, /beforeunload/); assert.match(editor, /guardAction/); assert.match(editor, /historical/); assert.match(editor, /sealedSource/);
  assert.match(editor, /role="alertdialog"/); assert.doesNotMatch(editor, /window\.confirm/);
  assert.match(editor, /Нет точного Word round-trip/); assert.match(editor, /ручное сохранение/);
  assert.doesNotMatch(editor + repository, /dangerouslySetInnerHTML|localStorage|service_role|send_offerpsp|sendEmail|supabase\.from\(/);
  assert.match(repository, /p_expected_revision: draft.revision/); assert.match(repository, /outcome === "conflict"/);
});
test('JSON backup recovery validates format and always creates independent new identity', () => {
  const draft = newWorkDocument('note'); draft.body.blocks[0].text = 'Recovered note';
  const json = JSON.stringify({ format: 'offerpsp-work-document', body: draft.body });
  const restored = documentFromBackup(json); assert.notEqual(restored.id, draft.id); assert.equal(restored.revision, 0); assert.equal(restored.body.blocks[0].text, 'Recovered note');
  assert.throws(() => documentFromBackup('{invalid'));
  assert.throws(() => documentFromBackup(JSON.stringify({ format: 'offerpsp-work-document', body: draft.body, id: draft.id })));
  assert.throws(() => documentFromBackup(JSON.stringify({ format: 'offerpsp-work-document', body: { ...draft.body, blocks: [{ ...createDocumentBlock('link'), url: 'javascript:alert(1)' }] } })));
});
test('gallery templates are independent universal documents, not persistent restricted types', () => {
  assert.equal(documentTemplates.length, 6);
  assert.ok(documentTemplates.some((template) => template.id === 'psp-proposal'));
  for (const template of documentTemplates) {
    const first = createDocumentFromTemplate(template.id); const second = createDocumentFromTemplate(template.id);
    assert.equal(first.body.kind, 'document'); assert.equal(first.body.template_id, undefined);
    assert.equal(first.revision, 0); assert.equal(validateWorkDocument(first.body), null); assert.notEqual(first.id, second.id);
    assert.equal(first.body.source, null); assert.deepEqual(first.body.links, { lead_id: null, provider_id: null, direction_id: null });
    assert.ok(first.body.blocks.every((block, index) => block.id !== second.body.blocks[index].id));
    if (first.body.blocks.some((block) => block.type === 'table')) first.body.blocks.find((block) => block.type === 'table').rows[0][0] = 'Independent';
    assert.equal(JSON.stringify(second.body).includes('Independent'), false);
  }
  assert.equal(createDocumentFromTemplate('blank').body.blocks.length, 1);
  assert.equal(createDocumentFromTemplate('blank').body.blocks[0].text, '');
});
test('blank sheet can become a PSP proposal without erasing custom content, identity, source or links', () => {
  const doc = createDocumentFromTemplate('blank'); doc.body.blocks[0].text = 'My existing introduction';
  doc.body.source = { label: 'Original', text: 'Preserve this', url: '' }; doc.body.links.lead_id = client;
  const before = JSON.stringify(doc.body); const next = appendDocumentTemplate(doc.body, 'psp-proposal');
  assert.equal(next.title, 'Рабочий лист — предложение PSP'); assert.equal(next.kind, 'document');
  assert.equal(next.blocks[0].text, 'My existing introduction'); assert.deepEqual(next.source, doc.body.source); assert.deepEqual(next.links, doc.body.links);
  assert.equal(JSON.stringify(doc.body), before); assert.equal(validateWorkDocument(next), null);
  assert.equal(appendDocumentTemplate({ ...doc.body, title: 'Custom title' }, 'contract').title, 'Custom title');
  assert.equal(appendDocumentTemplate(doc.body, 'contract').blocks[0].text, 'My existing introduction');
});
test('template insertion rejects overflow and unavailable choices without partial changes', () => {
  const body = createDocumentFromTemplate('blank').body; body.blocks = Array.from({ length: 100 }, () => createDocumentBlock('text'));
  const before = JSON.stringify(body); assert.throws(() => appendDocumentTemplate(body, 'note'), /100 блоков/);
  assert.throws(() => appendDocumentTemplate(body, 'blank')); assert.throws(() => createDocumentFromTemplate('unknown'));
  assert.equal(JSON.stringify(body), before);
});
test('all universal templates use unchanged staff save schema and round-trip correctly', () => withDb(async (db) => {
  for (const template of documentTemplates) {
    const doc = createDocumentFromTemplate(template.id); const saved = await save(db, doc);
    assert.equal(saved.outcome, 'saved'); assert.deepEqual((await get(db, doc.id)).body, doc.body);
  }
  assert.equal((await list(db)).total, documentTemplates.length);
}));
test('templates, library and editor are separate screens; no fixed document type selector remains', async () => {
  const editor = await readFile(new URL('../src/components/control/WorkDocumentDesk.tsx', import.meta.url), 'utf8');
  const gallery = await readFile(new URL('../src/components/control/DocumentTemplateGallery.tsx', import.meta.url), 'utf8');
  assert.match(editor, /useState<"templates" \| "library" \| "editor">\("templates"\)/);
  assert.match(editor, /screen === "templates" && <><DocumentTemplateGallery/);
  assert.match(editor, /draft && screen === "editor"/); assert.match(editor, /screen === "library"/);
  assert.doesNotMatch(editor, /aria-label="Тип документа"/); assert.match(editor, /appendDocumentTemplate\(draft.body/);
  assert.match(gallery, /Шаблоны нового документа/); assert.match(gallery, /любой лист можно превратить/);
});
