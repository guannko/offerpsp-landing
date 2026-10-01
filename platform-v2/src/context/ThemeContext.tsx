import { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { applyLightBridgeAppearance } from "../lib/bridgeAppearance";

// Kept as the root appearance wrapper; the bridge no longer offers a dark mode.
export function ThemeProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => { applyLightBridgeAppearance(document.documentElement); }, []);
  return <>{children}</>;
}
