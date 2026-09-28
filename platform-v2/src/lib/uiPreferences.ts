import { useEffect, useState } from "react";
import { isQaFixturePath } from "./qaFixtures";

export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? fallback : JSON.parse(stored) as T;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Preferences are an enhancement; private browsing must not break the workspace.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

function isWorkingPath(path: string) {
  if (!path || path.startsWith("/signin") || isQaFixturePath(path)) return false;
  try {
    const url = new URL(path, "https://offerpsp.local");
    return !url.searchParams.has("qa");
  } catch {
    return false;
  }
}

export function readRecentPaths() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("offerpsp.recentPaths") || "[]");
    const stored = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    const recent = stored.filter(isWorkingPath).slice(0, 6);
    if (recent.length !== stored.length) window.localStorage.setItem("offerpsp.recentPaths", JSON.stringify(recent));
    return recent;
  } catch {
    return [];
  }
}

export function rememberPath(path: string) {
  if (!isWorkingPath(path)) return;
  const recent = [path, ...readRecentPaths().filter((item) => item !== path)].slice(0, 6);
  try {
    window.localStorage.setItem("offerpsp.recentPaths", JSON.stringify(recent));
  } catch {
    // Non-critical UI preference.
  }
}
