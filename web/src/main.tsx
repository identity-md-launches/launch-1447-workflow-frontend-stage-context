import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadConfig } from "./config";
import { AppProvider } from "./state";
import App from "./App";
import "@fontsource/archivo-narrow/latin-700.css";
import "@fontsource/archivo-narrow/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./styles.css";
const root = createRoot(document.getElementById("root")!);
root.render(
  <div className="boot">
    <p className="eyebrow">Dead Drop</p>
    <h1>Opening the field kit.</h1>
    <p role="status">Loading and verifying deployment files…</p>
  </div>,
);
loadConfig()
  .then((config) =>
    root.render(
      <StrictMode>
        <AppProvider config={config}>
          <App />
        </AppProvider>
      </StrictMode>,
    ),
  )
  .catch((error) =>
    root.render(
      <div className="boot">
        <h1>Unable to open the field kit</h1>
        <p role="alert">{error.message}</p>
        <button className="button" onClick={() => location.reload()}>
          Reload deployment files
        </button>
      </div>,
    ),
  );
