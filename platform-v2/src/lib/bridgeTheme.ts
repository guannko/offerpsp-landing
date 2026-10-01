// Preserve the separately-owned workspaces, including their shared chrome.
export function usesPaperBridgeTheme(pathname: string): boolean {
  return !/^\/(seo-geo|agents)(\/|$)/.test(pathname);
}
