import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./services/queryClient/queryClient.ts";
import { RouterProvider } from "react-router";
import { router } from "./components/routes/Routes.tsx";
import { ThemeProvider } from "./services/lib/themes/ThemeProvider.tsx";
import "./components/i18n";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </ThemeProvider>,
);
