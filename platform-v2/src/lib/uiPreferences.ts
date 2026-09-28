import { useEffect, useState } from "react";

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

export function readRecentPaths() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("offerpsp.recentPaths") || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function rememberPath(path: string) {
  if (!path || path.startsWith("/signin")) return;
  const recent = [path, ...readRecentPaths().filter((item) => item !== path)].slice(0, 6);
  try {
    window.localStorage.setItem("offerpsp.recentPaths", JSON.stringify(recent));
  } catch {
    // Non-critical UI preference.
  }
}
