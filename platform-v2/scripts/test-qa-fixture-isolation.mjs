import assert from "node:assert/strict";
import { isQaFixtureTask } from "../src/lib/qaFixtures.ts";

assert.equal(isQaFixtureTask({
  lead_id: "0d982f0b-7b8f-4caa-9e36-8481b181b4ae",
  title: "Confirm company identity before linking contact",
  details: "WinPiski QA — NO ACTION REQUIRED submitted a new request.",
}), true, "QA marker must hide a task even when it was attached to a real lead ID");

assert.equal(isQaFixtureTask({
  lead_id: "ad724d57-e894-4d16-b7b0-948165aef4bf",
  title: "Golden scenario refresh",
}), true, "registered golden merchant tasks must remain outside Operations");

assert.equal(isQaFixtureTask({
  lead_id: "11111111-1111-4111-8111-111111111111",
  title: "Review Railon dossier",
  details: "Confirm missing currencies and payment methods.",
}), false, "ordinary merchant work must remain visible");

process.stdout.write("PASS QA fixture tasks stay outside ordinary Operations\n");
