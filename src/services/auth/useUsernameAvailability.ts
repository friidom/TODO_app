import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { isUsernameAvailable } from "./authApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import {
  isUsernameShapeValid,
  normalizeUsername,
  validateUsername,
} from "@/utils/username";

const DEBOUNCE_MS = 350;

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);

    return () => clearTimeout(id);
  }, [value, delay]);

  return settled;
}

export type UsernameStatus =
  "idle" | "invalid" | "checking" | "available" | "taken" | "error";

export interface UsernameAvailability {
  status: UsernameStatus;
  message?: string;
}

// Advisory only — the real guarantee is the unique index, this just answers before the confirmation email round trip.
export function useUsernameAvailability(input: string): UsernameAvailability {
  const settled = useDebounced(input, DEBOUNCE_MS);

  const username = normalizeUsername(settled);
  const shapeValid = isUsernameShapeValid(settled);

  const { data, isFetching, isError } = useQuery({
    queryKey: queryKeys.usernameAvailability(username),
    queryFn: () => isUsernameAvailable(username),
    enabled: shapeValid,
    staleTime: 30_000,
    retry: false,
    // the field shows its own state — a toast here would interrupt someone mid-word
    meta: { silent: true },
  });

  if (!normalizeUsername(input)) return { status: "idle" };

  // judged on the live value so a newly-invalid name says so immediately instead of waiting out the debounce
  const message = validateUsername(input);

  if (message) return { status: "invalid", message };

  if (!shapeValid || username !== normalizeUsername(input) || isFetching) {
    return { status: "checking" };
  }

  if (isError) return { status: "error" };
  if (data === undefined) return { status: "checking" };

  return { status: data ? "available" : "taken" };
}
