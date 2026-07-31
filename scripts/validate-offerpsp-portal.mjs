#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PORTAL_INACTIVE_STATUSES,
  isPortalTerminalStatus,
  portalEmptyStateKeys,
} from "../portal/request-state.js";

assert.deepEqual(PORTAL_INACTIVE_STATUSES, ["closed", "spam"]);
assert.equal(isPortalTerminalStatus("won"), true);
assert.equal(isPortalTerminalStatus("lost"), true);
assert.equal(isPortalTerminalStatus("matching"), false);
assert.deepEqual(portalEmptyStateKeys("won"), ["matchingComplete", "matchingCompleteCopy"]);
assert.deepEqual(portalEmptyStateKeys("lost"), ["matchingComplete", "matchingCompleteCopy"]);
assert.deepEqual(portalEmptyStateKeys("matching"), ["matchingProgress", "matchingCopy"]);

const appSource = await readFile(new URL("../portal/app.js", import.meta.url), "utf8");
assert.match(appSource, /\.eq\("client_user_id", state\.user\.id\)/);
assert.match(appSource, /\.not\("status", "in", `\(\$\{PORTAL_INACTIVE_STATUSES\.join\(","\)\}\)`\)/);

process.stdout.write("PASS portal request isolation and consistent terminal states\n");
