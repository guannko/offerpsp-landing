import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const failure = (code) => Object.assign(new Error(code), { code });

// Conservative public-unicast policy, not merely an RFC1918 check. Unknown ranges fail closed.
export function isPublicEvidenceAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes("%") || address.includes(".")) return false;
  const [left, right = ""] = address.toLowerCase().split("::");
  const first = left ? left.split(":") : [];
  const last = right ? right.split(":") : [];
  const parts = [...first, ...Array(8 - first.length - last.length).fill("0"), ...last].map((p) => parseInt(p, 16));
  // Reject mapped IPv4, local/multicast, NAT64, Teredo, 6to4 and documentation space.
  return parts[0] >= 0x2000 && parts[0] <= 0x3fff &&
    !(parts[0] === 0x2001 && (parts[1] < 0x0200 || parts[1] === 0x0db8)) &&
    parts[0] !== 0x2002 && !(parts[0] === 0x3fff && parts[1] < 0x1000);
}

export function evidenceUrl(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 2048 || /[\u0000-\u0020\\]/u.test(input.trim())) throw failure("invalid_url");
  let url;
  try { url = new URL(input.includes("://") ? input : `https://${input}`); } catch { throw failure("invalid_url"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) throw failure("invalid_url");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host.endsWith(".") || (!isIP(host) && (!host.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/.test(host)))) throw failure("blocked_host");
  if (isIP(host) && !isPublicEvidenceAddress(host)) throw failure("blocked_address");
  url.hash = "";
  // This is public evidence collection, not authenticated document retrieval.
  url.search = "";
  return url;
}

function pinnedLookup(address, family) {
  return (_host, options, callback) => {
    if (typeof options === "function") { callback = options; options = {}; }
    if (options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

// Exported for transport tests. Never accepts caller-supplied headers, cookies or credentials.
export function requestEvidencePage(url, address, { signal, maxBytes, kind }, transports = {}) {
  const request = url.protocol === "https:" ? (transports.https || httpsRequest) : (transports.http || httpRequest);
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET", agent: false, signal, maxHeaderSize: 16384,
      lookup: pinnedLookup(address.address, address.family), family: address.family,
      autoSelectFamily: false,
      headers: { "user-agent": "OfferPSP-Evidence/1.0", accept: kind === "rdap" ? "application/rdap+json, application/json" : "text/html, text/plain", "accept-encoding": "identity" },
    }, (res) => {
      res.on("error", reject);
      res.on("aborted", () => reject(failure("incomplete_response")));
      const statusCode = res.statusCode || 0;
      if (REDIRECTS.has(statusCode)) {
        resolve({ statusCode, location: res.headers.location });
        res.destroy();
        return;
      }
      const type = String(res.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const allowed = kind === "rdap" ? ["application/json", "application/rdap+json"] : ["text/html", "application/xhtml+xml", "text/plain"];
      const encoding = String(res.headers["content-encoding"] || "identity").toLowerCase();
      if (encoding !== "identity" || !allowed.includes(type)) {
        reject(failure("unsupported_content")); res.destroy(); return;
      }
      if (Number(res.headers["content-length"] || 0) > maxBytes) {
        reject(failure("response_too_large")); res.destroy(); return;
      }
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) { reject(failure("response_too_large")); res.destroy(); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

// Dependencies are injectable for offline adversarial tests; never derived from an HTTP request.
export function createEvidenceFetcher({ resolve = lookup, request = requestEvidencePage, timeoutMs = 15000, maxBytes = 524288, maxRedirects = 3 } = {}) {
  return async function fetchEvidence(input, { kind = "website" } = {}) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(failure("timeout")); }, timeoutMs);
    });
    const bounded = (promise) => Promise.race([promise, timeout]);
    let url;
    try {
      url = evidenceUrl(input);
      for (let hop = 0; hop <= maxRedirects; hop++) {
        controller.signal.throwIfAborted();
        const host = url.hostname.replace(/^\[|\]$/g, "");
        const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await bounded(resolve(host, { all: true, verbatim: true }));
        if (!addresses.length || addresses.some((a) => !isPublicEvidenceAddress(a.address) || isIP(a.address) !== a.family)) throw failure("blocked_address");
        controller.signal.throwIfAborted();
        const result = await bounded(request(url, addresses[0], { signal: controller.signal, maxBytes, kind }));
        if (REDIRECTS.has(result.statusCode)) {
          if (hop === maxRedirects) throw failure("redirect_limit");
          if (!result.location || /[\u0000-\u0020\\]/u.test(result.location)) throw failure("invalid_redirect");
          let next;
          try { next = evidenceUrl(new URL(result.location, url).href); } catch { throw failure("blocked_redirect"); }
          if (url.protocol === "https:" && next.protocol !== "https:") throw failure("blocked_redirect");
          url = next;
          continue;
        }
        let body = result.body;
        if (kind === "rdap") {
          try { body = JSON.parse(body); } catch { throw failure("invalid_json"); }
        }
        return { statusCode: result.statusCode, body, final_url: url.href };
      }
    } catch (error) {
      const allowed = new Set(["invalid_url", "blocked_host", "blocked_address", "timeout", "incomplete_response", "unsupported_content", "response_too_large", "redirect_limit", "invalid_redirect", "blocked_redirect", "invalid_json"]);
      // Never persist raw errors: they may contain remote input or network infrastructure details.
      return { statusCode: 0, body: kind === "rdap" ? {} : "", error: controller.signal.aborted ? "timeout" : allowed.has(error.code) ? error.code : "fetch_failed" };
    } finally { clearTimeout(timer); controller.abort(); }
  };
}

export const fetchPublicEvidence = createEvidenceFetcher();
