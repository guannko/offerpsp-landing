import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("scripts/n8n-offerpsp-branded-email.js"), "utf8");
const render = new Function("$input", source);
const signature = "Best regards,\nOfferPSP team\nhttps://offerpsp.com";
const body = `Hello Boris!\n\nVisit https://offerpsp.com/\n\n${signature}`;
const [{ json: message }] = render({
  first: () => ({ json: { body: { to: "test@example.com", subject: "Test subject", body } } }),
});

assert.equal(message.to, "test@example.com");
assert.equal(message.subject, "Test subject");
assert.equal(message.text, body);
assert.match(message.html, /OFFERPSP · PRIVATE PAYMENT MATCHING/);
assert.match(message.html, /BRAININDEX OÜ/);
assert.match(message.html, /mailto:bizdev@offerpsp\.com/);
assert.match(message.html, /@media only screen and \(max-width:640px\)/);
assert.match(message.html, /href="https:\/\/offerpsp\.com\/"/);
assert.doesNotMatch(message.html, /<script/i);
assert.equal((message.html.match(/Best regards,/g) || []).length, 1);
assert.equal((message.text.match(/Best regards,/g) || []).length, 1);

console.log("OfferPSP branded email template contract passed");
