import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth";
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt";
import { BrowserRouter } from "react-router-dom";
import "./styles.css";

if ("caches" in window) void caches.delete("kontia-pos-v2");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <PwaUpdatePrompt />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
