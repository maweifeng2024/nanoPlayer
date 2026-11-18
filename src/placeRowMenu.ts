/** Keep a scrollable row menu clear of its trigger, even at the bottom of the viewport. */
export function placeRowMenu(menu: HTMLElement, anchor: DOMRect) {
  const viewport = window.visualViewport;
  const left = (viewport?.offsetLeft ?? 0) + 8;
  const top = (viewport?.offsetTop ?? 0) + 8;
  const right = left + (viewport?.width ?? innerWidth) - 16;
  const bottom = top + (viewport?.height ?? innerHeight) - 16;
  const above = anchor.top - top;
  const below = bottom - anchor.bottom;
  const opensAbove = menu.scrollHeight > below && above > below;

  menu.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`;
  menu.style.left = `${Math.max(left, Math.min(anchor.right - menu.offsetWidth, right - menu.offsetWidth))}px`;
  menu.style.top = `${opensAbove ? anchor.top - menu.offsetHeight : anchor.bottom}px`;
}
