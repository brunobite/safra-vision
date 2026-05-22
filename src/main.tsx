import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/print.css";
import ErrorBoundary from "@/components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch((error) => {
      console.warn('[PWA] Service worker registration failed:', error);
    });
  });
}
