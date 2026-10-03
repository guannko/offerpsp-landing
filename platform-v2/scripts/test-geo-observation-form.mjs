import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGeoPrompt, extractGeoCitations, isPublicGeoUrl, localGeoDateTime, validateGeoObservation, geoMarkets } from '../src/lib/geoObservationForm.ts';

test('neutral scenarios do not plant the brand; branded scenario is explicit', () => {
  for (const language of ['ru', 'en']) for (const market of geoMarkets) {
    assert.doesNotMatch(buildGeoPrompt('discovery', language, market.value), /offerpsp/i);
    assert.doesNotMatch(buildGeoPrompt('methods', language, market.value), /offerpsp/i);
    assert.match(buildGeoPrompt('brand', language, market.value), /OfferPSP/);
    assert.equal(buildGeoPrompt('custom', language, market.value), '');
  }
  assert.match(buildGeoPrompt('discovery', 'ru', 'RU'), /Россия/);
  assert.match(buildGeoPrompt('methods', 'en', 'US'), /United States/);
});
test('extract only explicit HTTPS sources; dedupe Markdown and keep balanced parentheses', () => {
  assert.deepEqual(extractGeoCitations('OfferPSP at offerpsp.com. No actual link.'), { urls: [], rejected: [] });
  assert.deepEqual(extractGeoCitations('[source](https://offerpsp.com/about) https://offerpsp.com/about. https://example.com/wiki/A_(B).').urls,
    ['https://offerpsp.com/about', 'https://example.com/wiki/A_(B)']);
  assert.deepEqual(extractGeoCitations('https://offerpsp.com.evil.test/ http://offerpsp.com/').urls, ['https://offerpsp.com.evil.test/']);
});
test('reject access-token, credential, private network and non-HTTPS links', () => {
  for (const value of ['http://example.com', 'https://user:pass@example.com', 'https://127.0.0.1/a', 'https://[::1]/', 'https://localhost/a', 'https://service.internal/a', 'https://example.com/?access_token=private', 'https://example.com/?code=secret', 'https://example.com/#token=secret', 'javascript:alert(1)']) assert.equal(isPublicGeoUrl(value), false, value);
  assert.equal(isPublicGeoUrl('https://example.com/?utm_source=chatgpt'), true);
  assert.equal(extractGeoCitations('See https://example.com/?token=private').rejected.length, 1);
});
const input = () => ({ engine: 'chatgpt', model: '', language: 'ru', country: 'CY', prompt: 'Synthetic public query', response_text: 'Synthetic public answer, no live evidence.', citations: [], evidence_url: '', observed_at: new Date().toISOString() });
test('valid input retains the RPC shape; model and evidence are genuinely optional', () => {
  assert.doesNotThrow(() => validateGeoObservation(input()));
  assert.match(localGeoDateTime(), /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
});
test('reject missing country, missing response, invalid/future date, too many and private sources', () => {
  for (const patch of [{ country: '' }, { response_text: '  ' }, { observed_at: '' }, { observed_at: new Date(Date.now() + 600_000).toISOString() }, { citations: Array(51).fill('https://example.com/') }, { evidence_url: 'https://example.com/?token=secret' }, { response_text: 'Do not save https://example.com/?token=secret' }, { citations: ['https://localhost/'] }]) assert.throws(() => validateGeoObservation({ ...input(), ...patch }));
});
