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

function normalizeWorkingPath(path: string) {
  if (!path || path.startsWith("/signin") || isQaFixturePath(path)) return null;
  try {
    const url = new URL(path, "https://offerpsp.local");
    if (["qa", "release", "check"].some((param) => url.searchParams.has(param))) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function readRecentPaths() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("offerpsp.recentPaths") || "[]");
    const stored = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    const recent = stored.map(normalizeWorkingPath).filter((item): item is string => Boolean(item))
      .filter((item, index, items) => items.indexOf(item) === index).slice(0, 6);
    if (recent.length !== stored.length || recent.some((item, index) => item !== stored[index])) window.localStorage.setItem("offerpsp.recentPaths", JSON.stringify(recent));
    return recent;
  } catch {
    return [];
  }
}

export function rememberPath(path: string) {
  const normalized = normalizeWorkingPath(path);
  if (!normalized) return;
  const recent = [normalized, ...readRecentPaths().filter((item) => item !== normalized)].slice(0, 6);
  try {
    window.localStorage.setItem("offerpsp.recentPaths", JSON.stringify(recent));
  } catch {
    // Non-critical UI preference.
  }
}
