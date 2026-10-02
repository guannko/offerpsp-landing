// Copy reviewed executable OCR assets from npm's locked installation. No fetch,
// runtime CDN scripts or generated source modification. Language data is separate.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'package.json'));
const packages=Object.fromEntries(await Promise.all(['tesseract.js','tesseract.js-core'].map(async name=>{
  const file=require.resolve(`${name}/package.json`);
  const data=JSON.parse(await readFile(file,'utf8'));
  assert.equal(data.version,'7.0.0',`${name}: review OCR paths/CSP before changing the locked version`);
  return [name,{root:path.dirname(file),version:data.version}];
})));
const destination=path.join(root,'public/ocr/tesseract-7.0.0');
const assets=[['tesseract.js','dist/worker.min.js','worker.min.js'],
  ...['','-lstm','-simd','-simd-lstm','-relaxedsimd','-relaxedsimd-lstm'].map(variant=>[
    'tesseract.js-core',`tesseract-core${variant}.wasm.js`,`core/tesseract-core${variant}.wasm.js`,
  ])];
const receipt=[];
for(const [name,source,target] of assets){
  const input=path.join(packages[name].root,source),output=path.join(destination,target);
  const bytes=await readFile(input);assert.ok(bytes.length>1000);
  await mkdir(path.dirname(output),{recursive:true});await copyFile(input,output);
  receipt.push({path:target,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(path.join(destination,'assets.json'),JSON.stringify({schema_version:1,version:'7.0.0',assets:receipt},null,2)+'\n');
console.log(`Prepared ${assets.length} same-origin OCR executable assets from locked 7.0.0 packages`);
