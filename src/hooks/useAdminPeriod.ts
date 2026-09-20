import { useCallback } from "react";
import { useSearchParams } from "react-router";

import { isAdminPeriod, type AdminPeriod } from "@/services/admin/periods";
import { readDefaultPeriod } from "@/services/admin/preferences";

export function useAdminPeriod(): {
  period: AdminPeriod;
  setPeriod: (next: AdminPeriod) => void;
} {
  const [params, setParams] = useSearchParams();
  const raw = params.get("period");

  // The URL wins when it names a period; otherwise the screen opens on the
  // one this person chose in their preferences.
  const fallback = readDefaultPeriod();
  const period = isAdminPeriod(raw) ? raw : fallback;

  const setPeriod = useCallback(
    (next: AdminPeriod) => {
      const updated = new URLSearchParams(params);

      // The preferred period stays out of the URL, so /admin is a clean link
      // and a shared one carries a period only when someone picked a
      // different one on purpose.
      if (next === fallback) updated.delete("period");
      else updated.set("period", next);

      setParams(updated, { replace: true });
    },
    [params, setParams, fallback],
  );

  return { period, setPeriod };
}
