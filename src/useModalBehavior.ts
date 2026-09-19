import { useLayoutEffect, useRef } from "react";

const layers: HTMLElement[] = [];
const focusable =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]';

/** Only the top layer handles Escape/Tab, so nested dialogs close independently. */
export function useModalBehavior(open: boolean, onClose: () => void, menu = false) {
  const containerRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  onCloseRef.current = onClose;
  if (open && !wasOpenRef.current) {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpenRef.current = open;
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;
    layers.push(container);
    const items = () =>
      Array.from(container.querySelectorAll<HTMLElement>(focusable)).filter(
        (node) => node.getClientRects().length && !node.closest("[hidden], [inert]"),
      );
    if (!container.contains(document.activeElement)) items()[0]?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (layers.at(-1) !== container || event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      const buttons = items();
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
      if (event.key === "Tab" && buttons.length) {
        if (event.shiftKey && index <= 0) {
          event.preventDefault();
          buttons.at(-1)?.focus();
        } else if (!event.shiftKey && (index === buttons.length - 1 || index < 0)) {
          event.preventDefault();
          buttons[0].focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      const index = layers.lastIndexOf(container);
      if (index !== -1) layers.splice(index, 1);
      window.removeEventListener("keydown", onKeyDown);
      const previous = returnFocusRef.current;
      requestAnimationFrame(() => {
        if (previous?.isConnected && (!layers.length || layers.at(-1)?.contains(previous)))
          previous.focus({ preventScroll: true });
      });
    };
  }, [open, menu]);
  return containerRef;
}
