import { useEffect, useRef } from "react";

export function useModalBehavior(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  onCloseRef.current = onClose;
  if (open && !wasOpenRef.current) {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpenRef.current = open;
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => returnFocusRef.current?.focus(), 0);
    };
  }, [open]);
}
