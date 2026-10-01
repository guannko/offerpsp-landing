export function applyLightBridgeAppearance(root: Pick<HTMLElement,"classList"|"style">, getStorage: () => Pick<Storage,"setItem"> = () => window.localStorage): void {
  root.classList.remove("dark");
  root.style.colorScheme = "light";
  // Appearance must not depend on old preferences or writable browser storage.
  try { getStorage().setItem("theme","light"); } catch { /* Light mode still applies. */ }
}
