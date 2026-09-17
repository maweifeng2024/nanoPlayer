import { isAndroid, androidCommand } from "./platform/android";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./platform/android.css";

if (isAndroid()) {
  document.documentElement.dataset.platform = "android";
  document.documentElement.dataset.device =
    Math.min(screen.width, screen.height) >= 600 ? "pad" : "phone";
  void androidCommand<{ tablet: boolean }>("deviceInfo")
    .then(({ tablet }) => {
      document.documentElement.dataset.device = tablet ? "pad" : "phone";
    })
    .catch(() => undefined);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
