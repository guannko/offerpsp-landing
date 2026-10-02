import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCompanyMembersPanel } from '../portal/company-members.js';

const portalCss = await readFile(new URL('../portal/styles.css', import.meta.url), 'utf8');
assert.match(portalCss, /\.portal \.company-members-panel\s*\{[^}]*color:\s*var\(--paper\);[^}]*background:\s*#ffffff;/);
assert.match(portalCss, /\.portal \.company-join-row p\s*\{\s*color:\s*#5b6270;/);
assert.match(portalCss, /\.portal \.company-join-row select\s*\{[^}]*color:\s*var\(--paper\);[^}]*background:\s*#f4f5f7;/);

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this.hidden = false; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(name, callback) { this.events[name] = callback; }
  querySelector() { return this.children.find((child) => child.dataset.joinError) || null; }
}
const original = { document: globalThis.document, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
let poll;
globalThis.document = { hidden: false, createElement: (tag) => new Element(tag) };
globalThis.setInterval = (callback) => { poll = callback; return 1; };
globalThis.clearInterval = () => {};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const pending = { id: 'request', company: '<img onerror=bad()>', name: 'Alice', email: 'alice@example.com', status: 'pending_owner', can_decide: false };
let requests = [pending];
let error = null;
const calls = [];
let changed = 0;
const container = new Element('section');
const client = { async rpc(name, args) {
  calls.push({ name, args });
  if (name === 'decide_offerpsp_company_join_request') {
    requests = [{ ...pending, status: 'approved', can_decide: false }];
    return { data: { status: 'approved' }, error: null };
  }
  return { data: requests, error };
} };
const panel = createCompanyMembersPanel({ client, container, language: () => 'ru', onChanged: async () => { changed += 1; } });
try {
  panel.start(); await flush();
  assert.equal(container.hidden, false);
  const row = container.children.find((child) => child.tag === 'article');
  assert.equal(row.children.filter((child) => child.tag === 'button').length, 0, 'applicant cannot approve himself');
  assert.equal(row.children[0].textContent, '<img onerror=bad()> — Alice', 'untrusted company is text, never HTML');
  requests = [{ ...pending, can_decide: true }];
  await poll();
  const ownerRow = container.children.find((child) => child.tag === 'article');
  const select = ownerRow.children.find((child) => child.tag === 'label').children[0];
  assert.deepEqual(select.children.map((option) => option.value), ['viewer', 'manager']);
  select.value = 'viewer';
  await ownerRow.children.find((child) => child.tag === 'button').events.click();
  assert.deepEqual(calls.find((call) => call.name === 'decide_offerpsp_company_join_request').args,
    { p_request_id: 'request', p_approve: true, p_role: 'viewer' });
  assert.ok(changed >= 1, 'approved membership reloads the workspace');
  error = new Error('unavailable'); await poll();
  assert.ok(container.children.some((child) => child.dataset.joinError), 'load failure is visible, not false empty');
  panel.stop(); assert.equal(container.hidden, true); assert.equal(container.children.length, 0);
  let resolve;
  const stale = createCompanyMembersPanel({ client: { rpc: () => new Promise((done) => { resolve = done; }) }, container,
    language: () => 'en', onChanged: async () => {} });
  stale.start(); stale.stop(); resolve({ data: [pending], error: null }); await flush();
  assert.equal(container.children.length, 0, 'old requests cannot appear after logout');
  console.log('PASS company membership UI: roles, requester isolation, text safety, approval refresh, visible errors and logout fencing');
} finally { Object.assign(globalThis, original); }
