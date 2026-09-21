import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import type { AdminScope } from "@/services/admin/types";

export function useAdminScope(): {
  scope: AdminScope;
  setScope: (next: Partial<AdminScope>) => void;
} {
  const [params, setParams] = useSearchParams();
  const serialised = params.toString();

  const scope = useMemo((): AdminScope => {
    const read = new URLSearchParams(serialised);

    return {
      space: read.get("space") ?? undefined,
      board: read.get("board") ?? undefined,
    };
  }, [serialised]);

  const setScope = useCallback(
    (next: Partial<AdminScope>) => {
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);

          for (const [facet, value] of Object.entries(next)) {
            if (value === undefined || value === "") updated.delete(facet);
            else updated.set(facet, value);
          }

          if ("space" in next && next.space !== scope.space) {
            updated.delete("board");
          }

          return updated;
        },
        { replace: true },
      );
    },
    [setParams, scope.space],
  );

  return { scope, setScope };
}
