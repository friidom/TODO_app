import { useCallback } from "react";
import { useSearchParams } from "react-router";

import { DEFAULT_PERIOD, isAdminPeriod, type AdminPeriod } from "@/services/admin/periods";

export function useAdminPeriod(): {
  period: AdminPeriod;
  setPeriod: (next: AdminPeriod) => void;
} {
  const [params, setParams] = useSearchParams();
  const raw = params.get("period");
  const period = isAdminPeriod(raw) ? raw : DEFAULT_PERIOD;

  const setPeriod = useCallback(
    (next: AdminPeriod) => {
      const updated = new URLSearchParams(params);

      // The default stays out of the URL, so /admin is a clean link and a
      // shared one carries a period only when someone chose it.
      if (next === DEFAULT_PERIOD) updated.delete("period");
      else updated.set("period", next);

      setParams(updated, { replace: true });
    },
    [params, setParams],
  );

  return { period, setPeriod };
}
