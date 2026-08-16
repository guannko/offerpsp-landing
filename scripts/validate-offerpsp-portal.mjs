#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isPortalTerminalStatus,
  portalEmptyStateKeys,
} from "../portal/request-state.js";
import {
  localizedClientNote,
  localizedCommercialLine,
  localizedCommercialValue,
  localizedCountryName,
  readableOfferCode,
} from "../portal/offer-localization.js";

const sourceRefundRule = "первый рефанд по плательщику делается без дополнительных вопросов, последующие рефанды по этому плательщику служба поддержки расследует";
const englishRefundRule = "The first refund for a payer is processed without additional questions; subsequent refunds for the same payer are investigated by support.";

assert.equal(isPortalTerminalStatus("won"), true);
assert.equal(isPortalTerminalStatus("lost"), true);
assert.equal(isPortalTerminalStatus("matching"), false);
assert.deepEqual(portalEmptyStateKeys("won"), ["matchingComplete", "matchingCompleteCopy"]);
assert.deepEqual(portalEmptyStateKeys("lost"), ["matchingComplete", "matchingCompleteCopy"]);
assert.deepEqual(portalEmptyStateKeys("matching"), ["matchingProgress", "matchingCopy"]);
assert.equal(localizedCountryName("Russia", "ru"), "Россия");
assert.equal(localizedCountryName("Russia", "en"), "Russia");
assert.equal(localizedCountryName("KG", "ru"), "Киргизия");
assert.equal(readableOfferCode("CARDS", "ru"), "Карты");
assert.equal(readableOfferCode("CARDS", "en"), "Cards");
assert.equal(readableOfferCode("BANK_TRANSFER", "ru"), "Банковский перевод");
assert.equal(localizedCommercialValue("N/a", "ru"), "Не применяется");
assert.equal(localizedCommercialValue("N/a", "en"), "N/A");
assert.equal(localizedCommercialValue(sourceRefundRule, "en"), englishRefundRule);
assert.equal(
  localizedCommercialLine("Refund fee", "Refund fee - No", /^refund(?:\s+fee)?\b/i, "en"),
  "Refund fee: No",
);
assert.equal(
  localizedCommercialLine("Комиссия Refund", "Refund fee - No", /^refund(?:\s+fee)?\b/i, "ru"),
  "Комиссия Refund: Нет",
);
assert.equal(
  localizedClientNote(
    "Выбрано специалистом OfferPSP для вашего рассмотрения.",
    "en",
    "Selected by an OfferPSP specialist for your review.",
  ),
  "Selected by an OfferPSP specialist for your review.",
);

const appSource = await readFile(new URL("../portal/app.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../portal/index.html", import.meta.url), "utf8");
const publicHtmlSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const vercelConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const adminSource = await readFile(new URL("../admin/app.js", import.meta.url), "utf8");
const adminHtmlSource = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");
const selfServiceProfileMigration = await readFile(
  new URL("../supabase/migrations/20260816012341_offerpsp_portal_self_service_profile.sql", import.meta.url),
  "utf8",
).catch((error) => {
  if (error?.code === "ENOENT") return "";
  throw error;
});
assert.match(appSource, /rpc\("list_offerpsp_workspace_requests"\)/);
assert.match(appSource, /rpc\("list_offerpsp_client_deals"/);
assert.match(appSource, /rpc\("list_offerpsp_client_offers"/);
assert.doesNotMatch(appSource, /rpc\("list_offerpsp_client_options"/);
assert.match(appSource, /class="telegram-offer"/);
assert.match(appSource, /class="offer-flow-message"/);
assert.match(appSource, /from "\/portal\/offer-localization\.js"/);
assert.match(appSource, /offerLimit\(option, "payin"\)/);
assert.match(appSource, /offerLimit\(option, "payout"\)/);
assert.match(appSource, /offerFee\(option, "payin"\)/);
assert.match(appSource, /offerFee\(option, "payout"\)/);
assert.doesNotMatch(appSource, /from\("offerpsp_client_shortlist"\)/);
assert.match(appSource, /rpc\("get_offerpsp_client_request_profile"/);
assert.match(appSource, /rpc\("update_offerpsp_client_dossier"/);
assert.doesNotMatch(appSource, /from\("offerpsp_leads"\)/);
assert.match(appSource, /if \(status === "won"\) return \["nextWon", "nextWonCopy"\]/);
assert.match(htmlSource, /id="requestList"/);
assert.match(htmlSource, /id="portfolioSearch"/);
assert.match(appSource, /state\.portfolioQuery/);
assert.match(appSource, /rpc\("get_offerpsp_my_agent_brand"/);
assert.match(appSource, /Powered by OfferPSP/);
assert.match(appSource, /safeHttpsUrl\(brand\?\.brand_logo_url\)/);
assert.match(htmlSource, /data-i18n="newRequest"/);
assert.match(htmlSource, /class="empty-dashboard is-hidden"/);
assert.match(htmlSource, /data-i18n="processTitle"/);
assert.match(htmlSource, /data-i18n="prepareTitle"/);
assert.match(htmlSource, /data-open-support data-i18n="getSupport"/);
assert.match(htmlSource, /id="supportDialog"/);
assert.match(htmlSource, /id="supportMessageForm"/);
assert.match(appSource, /rpc\("ensure_offerpsp_portal_support_conversation"\)/);
assert.match(appSource, /MESSAGE_REFRESH_INTERVAL_MS = 3000/);
assert.match(appSource, /refreshSupportMessages\(\)\.catch/);
assert.match(appSource, /startConversationUpdates\(\)/);
assert.match(htmlSource, /class="request-nav"/);
assert.doesNotMatch(htmlSource, /Управляйте подключениями, а не перепиской по кругу/);
assert.match(htmlSource, /id="newRequestDialog"/);
assert.match(htmlSource, /id="newRequestForm"/);
assert.match(htmlSource, /data-open-new-request/);
for (const vertical of ["iGaming", "Forex"]) {
  const option = `<option value="${vertical}">${vertical}</option>`;
  assert.ok(htmlSource.includes(option), `Portal intake must include ${vertical}`);
  assert.ok(!publicHtmlSource.includes(option), `Public intake must not expose ${vertical} by name`);
}
for (const vertical of ["Regulated digital platform", "Regulated financial platform"]) {
  const option = `<option value="${vertical}">${vertical}</option>`;
  assert.ok(publicHtmlSource.includes(option), `Public intake must include ${vertical}`);
}
for (const vertical of ["Crypto", "Adult", "Nutra", "CBD"]) {
  const option = `<option value="${vertical}">${vertical}</option>`;
  assert.ok(!htmlSource.includes(option), `Portal intake must group ${vertical} under Other`);
  assert.ok(!publicHtmlSource.includes(option), `Public intake must group ${vertical} under Other`);
}
assert.doesNotMatch(htmlSource, /href="\/#request"/);
assert.match(appSource, /source_platform: "offerpsp-portal"/);
assert.match(appSource, /work_email: state\.user\.email/);
assert.match(appSource, /await supabase\.rpc\("claim_offerpsp_leads"\)/);
assert.match(appSource, /await loadWorkspace\(result\.lead_id \|\| null\)/);
const portalCacheHeader = vercelConfig.headers.find((entry) => entry.source === "/portal/(.*)");
assert.deepEqual(portalCacheHeader?.headers, [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
]);
assert.match(htmlSource, /id="dealSection"/);
assert.match(htmlSource, /id="clientDossierForm"/);
assert.match(htmlSource, /id="userProfileForm"/);
assert.match(htmlSource, /id="companyProfileForm"/);
assert.match(htmlSource, /data-i18n="navDocuments">Профиль/);
assert.match(htmlSource, /data-i18n="newRequest">Сформировать оффер/);
assert.match(appSource, /supabase\.auth\.updateUser/);
assert.match(appSource, /rpc\("ensure_offerpsp_my_merchant_profile"/);
assert.match(appSource, /rpc\("get_offerpsp_company_workspace_by_organization"/);
assert.match(appSource, /classList\.toggle\("profile-only", !hasRequests\)/);
assert.doesNotMatch(appSource, /service_role/);
if (selfServiceProfileMigration) {
  assert.match(selfServiceProfileMigration, /security definer/);
  assert.match(selfServiceProfileMigration, /pg_advisory_xact_lock/);
  assert.match(selfServiceProfileMigration, /revoke all on function public\.ensure_offerpsp_my_merchant_profile\(text\)[\s\S]*from public, anon, authenticated/);
  assert.match(selfServiceProfileMigration, /grant execute on function public\.ensure_offerpsp_my_merchant_profile\(text\)[\s\S]*to authenticated/);
}
assert.match(adminSource, /function isShareableShortlist\(shortlist\)/);
assert.match(adminSource, /offerpsp_shortlist_items\(id, offer_route_id, private_provider_id, client_snapshot\)/);
assert.match(adminSource, /rpc\("get_offerpsp_staff_request_workspace"/);
assert.match(adminSource, /rpc\("submit_offerpsp_dossier_for_review"/);
const matchingSource = adminSource.slice(
  adminSource.indexOf("async function runMatching()"),
  adminSource.indexOf("async function createShortlist()"),
);
assert.doesNotMatch(matchingSource, /create_offerpsp_route_shortlist/);
assert.match(adminSource, /rpc\("get_offerpsp_supply_workspace"/);
assert.match(adminSource, /rpc\("save_offerpsp_managed_provider"/);
assert.match(adminSource, /rpc\("save_offerpsp_route"/);
assert.match(adminSource, /rpc\("resolve_offerpsp_route_anomaly"/);
assert.match(adminSource, /rpc\("set_offerpsp_margin_policy"/);
assert.match(adminSource, /rpc\("get_offerpsp_management_registry"/);
assert.match(adminSource, /rpc\("save_offerpsp_managed_merchant"/);
assert.match(adminSource, /rpc\("set_offerpsp_merchant_record_state"/);
assert.match(adminSource, /rpc\("purge_offerpsp_merchant"/);
assert.match(adminSource, /rpc\("create_offerpsp_manual_route"/);
assert.match(adminSource, /rpc\("revise_offerpsp_route"/);
assert.match(adminSource, /rpc\("save_offerpsp_organization"/);
assert.match(adminSource, /rpc\("set_offerpsp_agent_assignment"/);
assert.match(adminSource, /rpc\("set_offerpsp_agent_margin_policy"/);
assert.match(adminHtmlSource, /id="supplyDrawer"/);
assert.match(adminHtmlSource, /id="supplyRouteForm"/);
assert.match(adminHtmlSource, /id="supplyAnomalyList"/);
assert.match(adminHtmlSource, /id="management"/);
assert.match(adminHtmlSource, /id="merchantRecordForm"/);
assert.match(adminHtmlSource, /id="manualOfferForm"/);
assert.match(adminHtmlSource, /id="organizationForm"/);

process.stdout.write("PASS persistent portal, operational Deal Desk and PSP supply workspace guards\n");
