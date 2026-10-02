import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { readPortalAuthCallbackError, portalAuthErrorMessage } from "../portal/auth-status.js";

const expiredHref = "https://offerpsp.com/portal/#error=access_denied&error_code=otp_expired&error_description=untrusted";
assert.deepEqual(readPortalAuthCallbackError(expiredHref), { code: "otp_expired" });
assert.deepEqual(readPortalAuthCallbackError("https://offerpsp.com/portal/?error=access_denied&error_code=otp_expired"), { code: "otp_expired" });
assert.equal(readPortalAuthCallbackError("https://offerpsp.com/portal/#workspaceTop"), null);
assert.equal(readPortalAuthCallbackError("https://offerpsp.com/portal/#access_token=synthetic&refresh_token=synthetic"), null);
assert.deepEqual(readPortalAuthCallbackError("https://offerpsp.com/portal/#error_code=%3Cscript%3E"), { code: "auth_callback_failed" });
assert.match(portalAuthErrorMessage({ code: "otp_expired" }, "ru"), /одноразовая/);
assert.match(portalAuthErrorMessage({ message: "Email link is invalid or has expired" }, "en"), /latest sign-in email/);
assert.doesNotMatch(portalAuthErrorMessage({ message: "rate limit exceeded" }), /Google/);
assert.doesNotMatch(portalAuthErrorMessage({ message: "<script>untrusted</script>" }), /script|untrusted/);

// Execute the actual startup block: errors must stay visible after enterPortal(null),
// while a real session must not be overridden by stale callback URL parameters.
const source = await readFile(new URL("../portal/app.js", import.meta.url), "utf8");
const bootstrap = source.slice(source.indexOf('const { data: { session }, error: sessionError }'), source.indexOf('supabase.auth.onAuthStateChange'));
assert.ok(source.indexOf("readPortalAuthCallbackError(window.location.href)") < source.indexOf("const supabase = createClient"));
assert.match(bootstrap, /await enterPortal\(session\)/);
for (const session of [null, { user: { id: "synthetic-user" } }]) {
  const calls = [];
  const context = { supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } },
    authCallbackError: readPortalAuthCallbackError(expiredHref), elements: { authStatus: {} },
    enterPortal: async (value) => calls.push(["enter", value]),
    friendlyAuthError: (error) => portalAuthErrorMessage(error, "ru"),
    setStatus: (_element, message, type) => calls.push(["status", message, type]) };
  await vm.runInNewContext(`(async () => { ${bootstrap} })()`, context);
  assert.equal(calls[0][0], "enter");
  assert.equal(calls.length, session ? 1 : 2);
  if (!session) { assert.match(calls[1][1], /одноразовая/); assert.equal(calls[1][2], "error"); }
}
console.log("PASS portal auth errors: callback capture, RU/EN guidance, no URL-data reflection or fabricated session, visible startup error");
