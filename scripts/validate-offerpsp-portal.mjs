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
assert.match(appSource, /rpc\("list_offerpsp_workspace_requests"\)/);
assert.match(appSource, /rpc\("list_offerpsp_client_deals"/);
assert.doesNotMatch(appSource, /from\("offerpsp_leads"\)/);
assert.match(appSource, /if \(status === "won"\) return \["nextWon", "nextWonCopy"\]/);
assert.match(htmlSource, /id="requestList"/);
assert.match(htmlSource, /data-i18n="newRequest"/);
assert.match(htmlSource, /id="dealSection"/);
assert.match(adminSource, /function isShareableShortlist\(shortlist\)/);
assert.match(adminSource, /offerpsp_shortlist_items\(id, offer_route_id, private_provider_id, client_snapshot\)/);

process.stdout.write("PASS persistent portal, safe RPC isolation, terminal states and admin share guard\n");
