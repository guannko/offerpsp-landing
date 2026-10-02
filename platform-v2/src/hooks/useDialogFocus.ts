import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const dialogs: HTMLElement[] = [];

/** Keep modal keyboard focus in its visible controls and restore its launcher. */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>, onEscape?: () => void) {
  const escape = useRef(onEscape);
  useEffect(() => { escape.current = onEscape; }, [onEscape]);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const launcher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogs.push(dialog);
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],[inert]'));
    const focusFirst = () => (controls()[0] || dialog).focus();
    if (!dialog.contains(document.activeElement)) focusFirst();
    const key = (event: KeyboardEvent) => {
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && escape.current) {
        event.preventDefault(); event.stopPropagation(); escape.current(); return;
      }
      if (event.key !== "Tab") return;
      const items = controls();
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const focus = (event: FocusEvent) => { if (dialogs[dialogs.length - 1] === dialog && event.target instanceof Node && !dialog.contains(event.target)) focusFirst(); };
    document.addEventListener("keydown", key);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("keydown", key); document.removeEventListener("focusin", focus);
      const index = dialogs.lastIndexOf(dialog);
      if (index >= 0) dialogs.splice(index, 1);
      if (launcher?.isConnected) launcher.focus();
    };
  }, [open, ref]);
}
