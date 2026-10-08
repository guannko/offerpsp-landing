import assert from 'node:assert/strict';
import { providerReliabilityItems } from '../api/_lib/provider-reliability-input.mjs';

const item = { name: 'Example PSP', website: 'https://example.com', entity_type: 'research_psp', entity_id: null, payload: { category: 'review_later' } };
assert.equal(providerReliabilityItems({ instruction: 'ordinary bulk operation' }), null);
assert.deepEqual(providerReliabilityItems({ instruction: 'PSP_RELIABILITY_BATCH:' + JSON.stringify({ items: [item] }) }), [item]);
assert.deepEqual(providerReliabilityItems({ provider_reliability: [{ ...item, ignored: 'never forwarded' }] }), [item]);
for (const provider_reliability of [null, [], [...Array(51)].map(() => item), [{ ...item, entity_type: 'merchant' }], [{ ...item, entity_id: 19 }]]) assert.throws(() => providerReliabilityItems({ provider_reliability }));
assert.throws(() => providerReliabilityItems({ instruction: 'PSP_RELIABILITY_BATCH:invalid' }));
assert.throws(() => providerReliabilityItems({ instruction: 'PSP_RELIABILITY_BATCH:' + 'a'.repeat(20_000) }));
console.log('PASS structured reliability batch routing / bounded identity / no inference');
