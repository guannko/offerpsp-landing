#!/usr/bin/env node

import assert from "node:assert/strict";
import { parseOfferSource } from "../api/_lib/offer-parser.mjs";

const sourceText = [
  "Country: Bangladesh P2C Type APMs Pricing / Fee Per transaction limits Settlement Settlement terms Pay-in E-Wallet bKash, Nagad 5,50% BDT 200 - 25,000 T+0 Binance + 2,50% Pay-out Disbursement to e-wallet Nagad & bKash 3,50% BDT 100 - 25,000",
  "Country: India Forex Type APMs Pricing / Fee Per transaction limits Settlement Settlement terms Pay-in UPI Bank/Ewallet transfer 5,50% INR 100-50,000 T+0 Floating Daily Rate Pay-out IMPS Disbursement to all bank account 3,50% / + 6 INR INR 100-50,000",
  "Country: India iGaming Type APMs Pricing / Fee Per transaction limits Settlement Settlement terms Pay-in UPI Bank/Ewallet transfer 5,00% INR 100-50,000 T+0 Floating Daily Rate Pay-out IMPS Disbursement to all bank account 3,50% / + 6 INR INR 100-50,000",
].join(" ");

const parsed = parseOfferSource({
  providerName: "PAYOK",
  sourceText,
  sourceType: "pdf",
  sourceFormat: "pdf",
});

const routes = parsed.batch.routes;
assert.equal(routes.length, 6, "flat country table must produce one route per PayIn/PayOut row");

const bangladesh = routes.filter((route) => route.geos.includes("BD"));
assert.equal(bangladesh.length, 2, "Bangladesh PayIn and PayOut must remain separate routes");
assert.ok(bangladesh.every((route) => route.currencies[0] === "BDT"));
assert.ok(bangladesh.every((route) => route.methods.includes("BKASH") && route.methods.includes("NAGAD")));
assert.ok(bangladesh.some((route) => route.flow === "payin" && route.fees.some((fee) => fee.base_percent === 5.5)));
assert.ok(bangladesh.some((route) => route.flow === "payout" && route.fees.some((fee) => fee.base_percent === 3.5)));

const indiaRoutes = routes.filter((route) => route.geos.includes("IN"));
assert.equal(indiaRoutes.length, 4, "separate India niches and flows must remain separate routes");
assert.equal(indiaRoutes.filter((route) => route.methods.includes("UPI")).length, 2);
assert.equal(indiaRoutes.filter((route) => route.methods.includes("IMPS")).length, 2);
assert.ok(indiaRoutes.every((route) => route.limits.some((limit) => limit.minimum_amount === 100 && limit.maximum_amount === 50000)));
assert.equal(parsed.batch.parser_metadata.blocking_anomaly_count, 0);

process.stdout.write(`${JSON.stringify({ routeCount: routes.length, blocking: parsed.batch.parser_metadata.blocking_anomaly_count })}\n`);
