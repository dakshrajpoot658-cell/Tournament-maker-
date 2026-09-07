import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

/*
  Polyfill for the window.storage API the app was originally built against
  (Claude's artifact storage). This swaps it for real browser localStorage
  so the exact same App.jsx works standalone, in Capacitor, or as a PWA.
  No code in App.jsx needs to change.
*/
window.storage = {
  async get(key) {
    const raw = window.localStorage.getItem(key);
    if (raw === null) throw new Error(`No value found for key: ${key}`);
    return { key, value: raw, shared: false };
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
    return { key, value, shared: false };
  },
  async delete(key) {
    window.localStorage.removeItem(key);
    return { key, deleted: true, shared: false };
  },
  async list(prefix = "") {
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
