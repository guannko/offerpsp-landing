// Keep the agents workspace unchanged; SEO/GEO shares the staff paper theme.
export function usesPaperBridgeTheme(pathname: string): boolean {
  return !/^\/agents(\/|$)/.test(pathname);
}
