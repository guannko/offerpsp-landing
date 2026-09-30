import assert from "node:assert/strict";
import { mailCompanySuggestion } from "../src/lib/mailCompanySuggestion.ts";
const psp = { id: 83, name: "PressPay", website: "https://www.presspay.example" };
assert.equal(mailCompanySuggestion("assaf@presspay.example", [psp])?.id, 83);
assert.equal(mailCompanySuggestion("assaf@presspay.example", [psp, { ...psp, id: 84 }]), null);
assert.equal(mailCompanySuggestion("assaf@presspay.example", [{ ...psp, record_state: "archived" }]), null);
assert.equal(mailCompanySuggestion("x@gmail.com", [{ ...psp, website: "https://gmail.com" }]), null);
assert.equal(mailCompanySuggestion("assaf@fake-presspay.example", [psp]), null);
console.log("PASS exact unique company-domain suggestion, ambiguous/shared-domain fences and no automatic linking");
