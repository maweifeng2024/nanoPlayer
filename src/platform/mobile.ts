import { invoke } from "@tauri-apps/api/core";
import { androidCommand, connectAndroidPlayback, isAndroid, sendAndroidPlayback } from "./android";

export function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}
export const isMobile = () => isAndroid() || isIOS();
export function mobileDevice() {
  if (isIOS()) return /iPad|Macintosh/i.test(navigator.userAgent) ? "pad" : "phone";
  return window.innerWidth >= 600 ? "pad" : "phone";
}

export const mobileCommand = <T = unknown>(action: string, args: Record<string, unknown> = {}) =>
  isIOS()
    ? invoke<T>("ios_native", { payload: { action, ...args } })
    : androidCommand<T>(action, args);

export const sendMobilePlayback = (action: string, args: Record<string, unknown> = {}) =>
  sendAndroidPlayback(action, args);
export const connectMobilePlayback = () => isIOS()
  ? connectAndroidPlayback(mobileCommand, (path) => path.startsWith("/"))
  : connectAndroidPlayback();
