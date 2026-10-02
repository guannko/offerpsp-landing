import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {appendOriginalText,checkDocxArchive,validateDocxInflation,workFileFormat,workFileHash} from '../src/lib/workDocumentFiles.ts';
import JSZip from 'jszip';
import {newWorkDocument,validateWorkDocument} from '../src/lib/workDocuments.ts';
import {usesPaperBridgeTheme} from '../src/lib/bridgeTheme.ts';
import {applyLightBridgeAppearance} from '../src/lib/bridgeAppearance.ts';
const staff='00000000-0000-4000-8000-000000000001';
const migrations=await Promise.all(['20261001165903_offerpsp_course_organizer.sql','20261001174709_offerpsp_workspace_documents.sql','20261001195538_offerpsp_work_document_files.sql'].map(file=>readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8')));
async function withDb(fn){
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create schema private;create schema storage;
      create table auth.users(id uuid primary key);insert into auth.users values('${staff}');
      create table public.offerpsp_leads(lead_id uuid primary key);create table public.offerpsp_tasks(id uuid primary key);
      create table private.offerpsp_providers(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.is_offerpsp_staff() returns boolean language sql stable as $$ select auth.uid()='${staff}'::uuid $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text,metadata jsonb,primary key(bucket_id,name));alter table storage.objects enable row level security;
      grant usage on schema auth,storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;
      select set_config('request.jwt.claim.sub','${staff}',false);`);
    for(const sql of migrations)await db.exec(sql);
    const draft=newWorkDocument('document');
    await db.query('select public.save_offerpsp_work_document($1,0,$2::jsonb)',[draft.id,JSON.stringify(draft.body)]);
    await fn(db,draft.id);
  }finally{await db.close();}
}
const fileId='00000000-0000-4000-8000-000000000009',hash='a'.repeat(64);
const reserve=async(db,id,rev=1,extra={})=>(await db.query('select public.reserve_offerpsp_work_file($1,$2,$3,$4,$5,$6,$7,$8) result',[id,rev,extra.id||fileId,extra.name||'contract.pdf',extra.format||'pdf',extra.size??100,extra.hash||hash,extra.text??'Original clause'])).rows[0].result;
const complete=async(db,id=fileId)=>(await db.query('select public.complete_offerpsp_work_file($1) result',[id])).rows[0].result;
test('theme covers workspaces but preserves SEO/GEO and agents including detail routes',()=>{
  for(const path of ['/','/communications','/inbox','/operations','/psps/abc','/deals','/analytics'])assert.equal(usesPaperBridgeTheme(path),true);
  for(const path of ['/seo-geo','/seo-geo/history','/agents','/agents/abc'])assert.equal(usesPaperBridgeTheme(path),false);
});
test('paper palette uses the supplied reference and shares organizer colours',async()=>{
  const css=await readFile(new URL('../src/layout/BridgePaper.css',import.meta.url),'utf8');
  for(const colour of ['#f8f4ee','#e9e3d9','#ecece3','#fffcf6','#2f2a25','#6c6459','#7b5d3e'])assert.ok(css.includes(colour));
  assert.doesNotMatch(css,/\.dark/);
  const organizer=await readFile(new URL('../src/components/control/CourseOrganizer.css',import.meta.url),'utf8');
  assert.match(organizer,/--course-paper:var\(--bridge-paper/);assert.match(organizer,/--course-olive:var\(--bridge-accent/);
  const header=await readFile(new URL('../src/layout/AppHeader.tsx',import.meta.url),'utf8');assert.doesNotMatch(header,/ThemeToggleButton/);
});
test('light-only appearance removes old dark preference even when browser storage is blocked',()=>{
  for(const blocked of [false,true]){
    const classes=new Set(['dark','other-class']),written=[];
    const root={classList:{remove:value=>classes.delete(value)},style:{}};
    applyLightBridgeAppearance(root,()=>{if(blocked)throw Error('Storage denied');return {setItem:(key,value)=>written.push([key,value])};});
    assert.equal(classes.has('dark'),false);assert.equal(classes.has('other-class'),true);assert.equal(root.style.colorScheme,'light');
    assert.deepEqual(written,blocked?[]:[['theme','light']]);
  }
});
test('supported bounded filenames and hashes; no .doc masquerading as DOCX',async()=>{
  assert.equal(workFileFormat('Contract.PDF',120),'pdf');assert.equal(workFileFormat('Договор.docx',120),'docx');
  for(const [name,size]of [['bad.doc',1],['bad.exe',1],['bad.pdf',0],['big.pdf',16000000],['bad\n.pdf',1]])assert.throws(()=>workFileFormat(name,size));
  assert.equal(await workFileHash(new TextEncoder().encode('abc').buffer),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.throws(()=>checkDocxArchive(new ArrayBuffer(30)),/ZIP/);
});
test('original text appends atomically without erasing prior text, links or sealed source',()=>{
  const body=newWorkDocument('document').body;body.blocks[0].text='Captain note';
  const next=appendOriginalText(body,'contract.docx','Original clause',true);
  assert.equal(next.blocks[0].text,'Captain note');assert.equal(next.source.text,'Original clause');assert.equal(validateWorkDocument(next),null);
  assert.equal(body.source,null);assert.equal(body.blocks.length,1);
  const sealed=appendOriginalText(next,'different.pdf','Another clause',false);assert.deepEqual(sealed.source,next.source);
  assert.throws(()=>appendOriginalText({...body,blocks:Array.from({length:100},()=>newWorkDocument('document').body.blocks[0])},'source','text',true));
  assert.throws(()=>appendOriginalText(body,'source','',true));
});
test('DOCX validates actual inflation, not just attacker-controlled declared ZIP sizes',async()=>{
  const zip=new JSZip();zip.file('word/document.xml','<document>'+'a'.repeat(1024)+'</document>');
  const safe=await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
  await validateDocxInflation(safe);
  const forged=safe.slice(0), view=new DataView(forged);
  let offset=0;for(;offset<forged.byteLength-46;offset++)if(view.getUint32(offset,true)===0x02014b50&&new TextDecoder().decode(new Uint8Array(forged,offset+46,view.getUint16(offset+28,true)))==='word/document.xml')break;
  view.setUint32(offset+24,10,true);
  await assert.rejects(validateDocxInflation(forged),/Фактический объём|каталогу/);
});
test('reservation requires saved current document, validates metadata, deduplicates and requires uploaded object',()=>withDb(async(db,id)=>{
  await assert.rejects(reserve(db,crypto.randomUUID()),/save document/);
  await assert.rejects(reserve(db,id,0),/revision conflict/);
  await assert.rejects(reserve(db,id,1,{name:'fake.exe'}),/invalid file metadata/);
  const first=await reserve(db,id);assert.equal(first.status,'pending');assert.equal(first.extracted_text,undefined);
  const retry=await reserve(db,id,1,{id:crypto.randomUUID()});assert.equal(retry.id,first.id);
  await assert.rejects(reserve(db,id,1,{text:'changed'}),/metadata differs/);
  await assert.rejects(complete(db),/not confirmed/);
  await db.query('insert into storage.objects values($1,$2,$3::jsonb)',['offerpsp-work-originals',first.object_path,JSON.stringify({size:99,mimetype:'application/pdf'})]);
  await assert.rejects(complete(db),/not confirmed/);
  await db.query('update storage.objects set metadata=$1::jsonb',[JSON.stringify({size:100,mimetype:'application/pdf'})]);
  const saved=await complete(db);assert.equal(saved.status,'ready');assert.equal((await complete(db)).id,saved.id);
  const read=(await db.query('select public.get_offerpsp_work_file($1) result',[fileId])).rows[0].result;assert.equal(read.extracted_text,'Original clause');
  assert.equal((await db.query('select count(*)::int n from private.offerpsp_work_document_files')).rows[0].n,1);
}));
test('Storage policies allow only reserved staff insert/read; no original update/delete or outsider read',()=>withDb(async(db,id)=>{
  const original=await reserve(db,id);
  await db.exec('set role authenticated');
  await assert.rejects(db.query("insert into storage.objects values('offerpsp-work-originals','unreserved.pdf','{}')"),/row-level security/);
  await db.query('insert into storage.objects values($1,$2,$3::jsonb)',['offerpsp-work-originals',original.object_path,JSON.stringify({size:100,mimetype:'application/pdf'})]);
  await complete(db);
  assert.equal((await db.query("select * from storage.objects where bucket_id='offerpsp-work-originals'")).rows.length,1);
  await db.query("update storage.objects set metadata='{}' where bucket_id='offerpsp-work-originals'");
  assert.equal((await db.query('select metadata from storage.objects')).rows[0].metadata.size,100);
  await db.query('delete from storage.objects');assert.equal((await db.query('select * from storage.objects')).rows.length,1);
  await assert.rejects(db.query('select * from private.offerpsp_work_document_files'),/permission denied/);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await assert.rejects(complete(db),/staff access required/);
  await assert.rejects(db.query('select public.get_offerpsp_work_file($1)',[fileId]),/staff access required/);
  await db.exec('reset role;set role anon');await assert.rejects(complete(db),/permission denied/);
}));
test('listing never reads source text and historical versions exclude later attachments',()=>withDb(async(db,id)=>{
  const body=newWorkDocument('document').body;await db.query('select public.save_offerpsp_work_document($1,1,$2::jsonb)',[id,JSON.stringify(body)]);
  await reserve(db,id,2);
  const old=(await db.query('select public.list_offerpsp_work_files($1,1) result',[id])).rows[0].result;assert.equal(old.files.length,0);
  const current=(await db.query('select public.list_offerpsp_work_files($1,2) result',[id])).rows[0].result;assert.equal(current.files.length,1);assert.equal(current.files[0].extracted_text,undefined);
  await assert.rejects(db.query('select public.list_offerpsp_work_files($1,99)',[id]),/version not found/);
}));
test('RPC grants and search paths are staff-only; no third-party upload, HTML execution or upsert',async()=>{
  const repository=await readFile(new URL('../src/lib/workOriginalRepository.ts',import.meta.url),'utf8');
  const view=await readFile(new URL('../src/components/control/WorkOriginalFiles.tsx',import.meta.url),'utf8');
  assert.match(repository,/upsert:false/);assert.match(repository,/workFileHash/);assert.doesNotMatch(repository+view,/service_role|localStorage|dangerouslySetInnerHTML|getPublicUrl|createSignedUrl/);
  assert.match(view,/revision<1/);assert.match(view,/historical/);assert.match(view,/OCR сканов здесь не включён/);
  await withDb(async(db)=>{
    for(const fn of ['public.reserve_offerpsp_work_file(uuid,integer,uuid,text,text,integer,text,text)','public.complete_offerpsp_work_file(uuid)','public.list_offerpsp_work_files(uuid,integer)','public.get_offerpsp_work_file(uuid)']){
      const info=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[fn])).rows[0];assert.equal(info.prosecdef,true);assert.deepEqual(info.proconfig,['search_path=""']);
      for(const role of ['anon','service_role'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed,false);
    }
  });
});
