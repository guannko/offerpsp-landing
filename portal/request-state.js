export const PORTAL_INACTIVE_STATUSES = Object.freeze(["closed", "spam"]);

const PORTAL_TERMINAL_STATUSES = new Set(["won", "lost"]);

export function isPortalTerminalStatus(status) {
  return PORTAL_TERMINAL_STATUSES.has(status);
}

export function portalEmptyStateKeys(status) {
  return isPortalTerminalStatus(status)
    ? ["matchingComplete", "matchingCompleteCopy"]
    : ["matchingProgress", "matchingCopy"];
}
