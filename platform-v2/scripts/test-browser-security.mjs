import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const root=new URL('../',import.meta.url);
const config=JSON.parse(await readFile(new URL('vercel.json',root),'utf8'));
const policy=config.headers.find(row=>row.source==='/(.*)').headers.find(row=>row.key==='Content-Security-Policy').value;
const directives=new Map(policy.split(';').map(part=>part.trim().split(/\s+/)).filter(parts=>parts[0]).map(([name,...values])=>[name,values]));

test('staff CSP blocks inline/eval/third-party executable scripts and handlers',()=>{
  assert.deepEqual(directives.get('default-src'),["'self'"]);
  assert.deepEqual(directives.get('script-src'),["'self'","'wasm-unsafe-eval'"]);
  assert.deepEqual(directives.get('script-src-attr'),["'none'"]);
  assert.deepEqual(directives.get('object-src'),["'none'"]);
  assert.deepEqual(directives.get('base-uri'),["'self'"]);
  assert.deepEqual(directives.get('form-action'),["'self'"]);
  assert.deepEqual(directives.get('worker-src'),["'self'",'blob:']);
  assert.deepEqual(directives.get('frame-src'),["'self'",'blob:']);
  assert.deepEqual(directives.get('frame-ancestors'),["'self'"]);
});
test('staff data connections permit only canonical Supabase and two OCR data paths',()=>{
  assert.deepEqual(directives.get('connect-src'),[
    "'self'",'https://iceopurxqzqmwtcmwfzl.supabase.co','wss://iceopurxqzqmwtcmwfzl.supabase.co',
    'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/',
    'https://cdn.jsdelivr.net/npm/@tesseract.js-data/rus/4.0.0_best_int/',
  ]);
  assert.ok(directives.get('style-src').includes('https://fonts.googleapis.com'));
  assert.ok(directives.get('font-src').includes('https://fonts.gstatic.com'));
  assert.ok(directives.get('img-src').includes('data:'));
});
test('OCR executable assets are prepared from locked packages, not a runtime CDN',async()=>{
  const source=await readFile(new URL('src/lib/offerSourceFiles.ts',root),'utf8');
  assert.match(source,/workerPath:\s*new URL\("\/ocr\/tesseract-7\.0\.0\/worker\.min\.js"/);
  assert.match(source,/corePath:\s*new URL\("\/ocr\/tesseract-7\.0\.0\/core"/);
  assert.match(source,/workerBlobURL:false/);
  const build=JSON.parse(await readFile(new URL('package.json',root),'utf8')).scripts.build;
  assert.ok(build.startsWith('node scripts/prepare-ocr-assets.mjs &&'));
});
