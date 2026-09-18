import { isAndroid } from "./platform/android";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./platform/android.css";

if (isAndroid()) {
  document.documentElement.dataset.platform = "android";
  const updateLayout = () => {
    document.documentElement.dataset.device = window.innerWidth >= 600 ? "pad" : "phone";
  };
  updateLayout();
  window.addEventListener("resize", updateLayout);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
