import { isMobile, isIOS, mobileDevice } from "./platform/mobile";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./platform/android.css";
import "./platform/iosLibrary.css";

if (isMobile()) {
  document.documentElement.dataset.platform = isIOS() ? "ios" : "android";
  const updateLayout = () => {
    document.documentElement.dataset.device = mobileDevice();
  };
  updateLayout();
  window.addEventListener("resize", updateLayout);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
