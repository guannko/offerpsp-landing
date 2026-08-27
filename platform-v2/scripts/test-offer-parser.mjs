#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseOfferSource } from "../api/_lib/offer-parser.mjs";

const sourceText = [
  "Country: Bangladesh P2C Type APMs Pricing / Fee Per transaction limits Settlement Settlement terms Pay-in E-Wallet bKash, Nagad 5,50% BDT 200 - 25,000 T+0 Binance + 2,50% Pay-out Disbursement to e-wallet Nagad & bKash 3,50% BDT 100 - 25,000",
  "Country: India Forex Type APMs Pricing / Fee Per transaction limits Settlement Settlement terms Pay-in UPI Bank/Ewallet transfer 5,50% INR 100-50,000 T+0 Floating Daily Rate Pay-out IMPS Disbursement to all bank account 3,50% / + 6 INR INR 100-50,000",
  "Country: India iGaming Type APMs Pricing / Fee Per transaction limits Settlement Settlement terms Pay-in UPI Bank/Ewallet transfer 5,00% INR 100-50,000 T+0 Floating Daily Rate Pay-out IMPS Disbursement to all bank account 3,50% / + 6 INR INR 100-50,000",
  "Country: Indonesia Type APMs Pricing / Fee Per transaction limits Settlement Settlement terms Pay-in BANK VA BCA / BNI / CIMB / PERMATA / MANDIRI / BRI / BSI VA 1,50% / + 6,000 IDR IDR 10,000 - 50,000,000 T+1 XE + 1,50% Pay-out Disbursement to all bank accounts and e-wallets 1,50% / + 6,000 IDR IDR 10,000 - 50,000,000",
].join(" ");

const parsed = parseOfferSource({
  providerName: "PAYOK",
  sourceText,
  sourceType: "pdf",
  sourceFormat: "pdf",
});

const routes = parsed.batch.routes;
assert.equal(routes.length, 8, "flat country table must produce one route per PayIn/PayOut row");

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
assert.equal(indiaRoutes.filter((route) => route.verticals.includes("FOREX")).length, 2, "Forex must carry from the country heading into both flows");
assert.equal(indiaRoutes.filter((route) => route.verticals.includes("IGAMING")).length, 2, "iGaming must carry from the country heading into both flows");
assert.ok(indiaRoutes.every((route) => !route.anomalies.some((anomaly) => anomaly.code === "vertical_unconfirmed")));

const indonesiaRoutes = routes.filter((route) => route.geos.includes("ID"));
assert.equal(indonesiaRoutes.length, 2, "Indonesia PayIn and PayOut must remain separate routes");
assert.ok(
  indonesiaRoutes.every((route) => route.fees.some((fee) => fee.base_fixed === 6000 && fee.base_fixed_currency === "IDR")),
  "locale-grouped fixed fees must remain 6,000 IDR, not 6 IDR",
);
assert.equal(parsed.batch.parser_metadata.blocking_anomaly_count, 0);

const payokVietnamGaming = parseOfferSource({
  providerName: "PAYOK",
  sourceText: "Country: Vietnam\nPay-in E-wallet MOMO P2C (Only Gaming) 2,90% VND 20,000 - 50,000,000 Settlement: T+0 Binance C2C + 1,20%",
  sourceType: "pdf",
  sourceFormat: "pdf",
}).batch.routes[0];
assert.deepEqual(payokVietnamGaming.verticals, ["IGAMING"], "plain Gaming must normalize to IGAMING");
assert.ok(payokVietnamGaming.methods.includes("P2C"), "payment-side P2C must remain a method");
assert.ok(!payokVietnamGaming.methods.includes("C2C"), "settlement-side Binance C2C must not become a payment method");

const payokVietnamGamingForex = parseOfferSource({
  providerName: "PAYOK",
  sourceText: "Country: Vietnam\nPay-in VietQR All bank scan QR to Pay (Gaming / Forex) 1,50% VND 50,000 - 499,000,000 Settlement: T+0 Binance C2C + 1,20%",
  sourceType: "pdf",
  sourceFormat: "pdf",
}).batch.routes[0];
assert.deepEqual(payokVietnamGamingForex.verticals, ["IGAMING", "FOREX"], "combined Gaming / Forex must preserve both verticals");
assert.ok(!payokVietnamGamingForex.methods.includes("C2C"), "settlement exchange mechanics must stay out of payment methods");

const providerPortalSource = await readFile(
  fileURLToPath(new URL("./fixtures/provider-portal-multi-offer.txt", import.meta.url)),
  "utf8",
);
const providerPortalParsed = parseOfferSource({
  providerName: "Fixture PSP",
  sourceText: providerPortalSource,
  sourceType: "telegram",
  sourceReference: "provider-portal-multi-offer-fixture",
});
const providerRoutes = providerPortalParsed.batch.routes;
assert.equal(providerRoutes.length, 6, "Telegram message must produce six independent offer routes");
assert.equal(providerRoutes.filter((route) => route.geos.includes("UZ")).length, 2);
assert.equal(providerRoutes.filter((route) => route.geos.includes("AZ")).length, 2);
assert.equal(providerRoutes.filter((route) => route.geos.includes("KG")).length, 1);
assert.equal(providerRoutes.filter((route) => route.geos.includes("KZ")).length, 1);
assert.ok(providerRoutes.some((route) => route.fees.some((fee) => fee.base_percent === 1.75)), "HTML-encoded payout fee must decode to 1.75%");
assert.ok(providerRoutes.some((route) => route.limits.some((limit) => limit.minimum_amount === 3000 && limit.maximum_amount === 150000)), "HTML-encoded KGS limit must decode correctly");
const uzbekEcom = providerRoutes.find((route) => route.geos.includes("UZ") && route.methods.includes("HUMO") && !route.methods.includes("P2P"));
assert.deepEqual(uzbekEcom.limits.map((limit) => limit.flow), ["payin", "payout"], "PayIn and PayOut limits must retain their labelled flows through Markdown");
assert.ok(uzbekEcom.fees.some((fee) => fee.flow === "payin" && fee.traffic_tier === "FTD" && fee.base_percent === 17));
assert.ok(uzbekEcom.fees.some((fee) => fee.flow === "payin" && fee.traffic_tier === "TRUSTED" && fee.base_percent === 15));
assert.match(uzbekEcom.risk_terms.chargeback, /100\$/);
const kyrgyz = providerRoutes.find((route) => route.geos.includes("KG"));
assert.deepEqual(kyrgyz.limits.map((limit) => limit.flow), ["payin", "payout"], "KGS limits must retain separate PayIn and PayOut flows");
assert.ok(providerRoutes.every((route) => route.raw_block.length > 0), "Every route must preserve its immutable source block");
assert.equal(providerPortalParsed.batch.parser_metadata.publication_allowed, false);

process.stdout.write(`${JSON.stringify({ routeCount: routes.length, providerPortalRouteCount: providerRoutes.length, blocking: parsed.batch.parser_metadata.blocking_anomaly_count, providerPortalBlocking: providerPortalParsed.batch.parser_metadata.blocking_anomaly_count })}\n`);
