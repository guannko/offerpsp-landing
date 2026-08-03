#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isPortalTerminalStatus,
  portalEmptyStateKeys,
} from "../portal/request-state.js";

assert.equal(isPortalTerminalStatus("won"), true);
assert.equal(isPortalTerminalStatus("lost"), true);
assert.equal(isPortalTerminalStatus("matching"), false);
assert.deepEqual(portalEmptyStateKeys("won"), ["matchingComplete", "matchingCompleteCopy"]);
assert.deepEqual(portalEmptyStateKeys("lost"), ["matchingComplete", "matchingCompleteCopy"]);
assert.deepEqual(portalEmptyStateKeys("matching"), ["matchingProgress", "matchingCopy"]);

const appSource = await readFile(new URL("../portal/app.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../portal/index.html", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../admin/app.js", import.meta.url), "utf8");
const adminHtmlSource = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");
assert.match(appSource, /rpc\("list_offerpsp_workspace_requests"\)/);
assert.match(appSource, /rpc\("list_offerpsp_client_deals"/);
assert.match(appSource, /rpc\("list_offerpsp_client_offers"/);
assert.doesNotMatch(appSource, /rpc\("list_offerpsp_client_options"/);
assert.match(appSource, /class="telegram-offer"/);
assert.match(appSource, /class="offer-flow-message"/);
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
assert.match(htmlSource, /data-i18n="newRequest"/);
assert.match(htmlSource, /id="dealSection"/);
assert.match(htmlSource, /id="clientDossierForm"/);
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
