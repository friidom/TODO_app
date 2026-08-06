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

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </AuthProvider>
  </ThemeProvider>,
);
