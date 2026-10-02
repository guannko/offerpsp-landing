import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Source contracts complement, but do not replace, browser or screen-reader tests.
const source=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
for(const file of ['src/pages/OperationsWorkspace.tsx','src/pages/CompliancePage.tsx']){
 const text=source(file),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function walk(node){
  if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&['input','select','textarea'].includes(node.tagName.getText(ast))) {
   const attrs=node.attributes.properties;
   let wrapped=false;for(let p=node.parent;p;p=p.parent)if(ts.isJsxElement(p)&&['label','Field'].includes(p.openingElement.tagName.getText(ast)))wrapped=true;
   assert.ok(wrapped||attrs.some(a=>['aria-label','aria-labelledby'].includes(a.name?.getText(ast))),`${file}: unnamed ${node.tagName.getText(ast)}`);
  }ts.forEachChild(node,walk);
 }walk(ast);
}
const header=source('src/layout/AppHeader.tsx');
assert.match(source('src/pages/OperationsWorkspace.tsx'),/aria-label="Закрыть форму задачи"/);
const operations=source('src/pages/OperationsWorkspace.tsx');
assert.match(operations,/inline-flex max-w-full flex-wrap/,'Operations mode buttons must fit a 320px viewport');
assert.match(operations,/grid w-full min-w-0 grid-cols-1[^\"]*\[overflow-wrap:anywhere\]/,'Long task identifiers must not force page-level horizontal scrolling');
const mail=source('src/pages/CaptainPages.tsx');
assert.ok(mail.includes('mt-4 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2'),'Mail accordion columns must be allowed to shrink');
assert.ok(mail.includes('grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[140px_160px_minmax(0,1fr)]'),'Native datetime controls must not set the mail grid minimum width');
assert.ok(mail.includes('absolute right-0 z-30 mt-2 w-56 max-w-[calc(100vw-3rem)]'),'Draft menu must remain inside narrow viewports');
assert.match(header,/useDialogFocus\(paletteOpen, paletteRef/);
assert.match(header,/aria-label="Поиск записей и команд"/);
assert.match(header,/role="combobox"/);
assert.match(header,/aria-activedescendant=/);
assert.match(header,/event.target === inputRef.current/);
assert.doesNotMatch(header,/autoFocus|setTimeout.*inputRef/);
const calendar=source('src/components/control/OperationsCalendar.tsx');
for(const key of ['ArrowRight','ArrowLeft','Home','End'])assert.ok(calendar.includes(`"${key}"`));
assert.match(calendar,/tabIndex=\{layer === item.id \? 0 : -1\}/);
assert.match(calendar,/role="tabpanel"/);
assert.match(calendar,/aria-live="polite"/);
assert.match(source('src/components/control/Ui.tsx'),/role="alert"/);
assert.match(source('src/layout/AppLayout.tsx'),/href="#bridge-content"/);
const config=JSON.parse(source('vercel.json'));
const headers=Object.fromEntries(config.headers.find(h=>h.source==='/(.*)').headers.map(h=>[h.key,h.value]));
assert.equal(headers['X-Content-Type-Options'],'nosniff');
assert.equal(headers['X-Frame-Options'],'SAMEORIGIN');
assert.equal(headers['Referrer-Policy'],'no-referrer');
assert.equal(headers['Content-Security-Policy'],"base-uri 'self'; object-src 'none'; frame-ancestors 'self'");
console.log('PASS: scoped accessible-name, keyboard/focus and transport-header source contracts (not WCAG certification)');
