import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
// Global stylesheet, imported at the entry point. It used to hang off App.tsx,
// which stopped being rendered when `/` became a redirect — leaving it there
// would have dropped every style from the bundle.
import "./styles/global.css";
import { queryClient } from "./services/queryClient/queryClient.ts";
import { RouterProvider } from "react-router";
import { router } from "./components/routes/Routes.tsx";
import { ThemeProvider } from "./providers/ThemeProvider.tsx";
import { AuthProvider } from "./providers/AuthProvider.tsx";
import { ToastProvider } from "./providers/ToastProvider.tsx";
import "./components/i18n";
import { Agentation } from "agentation";

const CHUNK_RELOAD_KEY = "kan:chunk-reload-at";

// A deploy replaces the hashed chunks, so a tab opened before it asks for files
// that no longer exist. Reload once to pick up the new build; a second failure
// within a minute is a real error and goes to the route's error page.
window.addEventListener("vite:preloadError", (event) => {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY));

    if (Date.now() - last < 60_000) return;

    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }

  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
          {import.meta.env.DEV && (
            <Agentation endpoint="http://localhost:4747" />
          )}
        </ToastProvider>
      </QueryClientProvider>
    </AuthProvider>
  </ThemeProvider>,
);
