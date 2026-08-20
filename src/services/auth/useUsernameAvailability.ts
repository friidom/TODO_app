import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "../api/supabase";
import { queryKeys } from "@/services/queryClient/queryKeys";
import {
  isUsernameShapeValid,
  normalizeUsername,
  validateUsername,
} from "@/utils/username";

/** Long enough that typing a name is one request, short enough to feel live. */
const DEBOUNCE_MS = 350;

/**
 * `value`, but only after it has stopped changing for `delay`.
 *
 * The same three lines as `useInviteeSearch`'s, and deliberately not shared
 * with it: lifting two identical five-line hooks into one module buys nothing
 * and couples a registration screen to an invite field.
 */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);

    return () => clearTimeout(id);
  }, [value, delay]);

  return settled;
}

/** What the field should be showing right now. */
export type UsernameStatus =
  "idle" | "invalid" | "checking" | "available" | "taken" | "error";

export interface UsernameAvailability {
  status: UsernameStatus;
  /** Set when `status` is `invalid` — the reason, ready to render. */
  message?: string;
}

async function checkUsername(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("username_available", {
    p_username: username,
  });

  if (error) throw error;

  return data === true;
}

/**
 * Is this username free? (M10-01)
 *
 * **An advisory answer, and the UI must treat it as one.** Between this
 * returning `available` and the account actually being provisioned there is a
 * confirmation email and however long it takes someone to open it, so the name
 * can be taken in the meantime by anyone. The guarantee lives in
 * `profiles_username_lower_key`; this exists so the common case is answered
 * before the form is submitted rather than after a confirmation click.
 *
 * **The shape check runs first and locally.** A name that cannot be valid is
 * never sent — there is nothing for the server to tell us, and asking would
 * mint a cache entry per keystroke of a name that will be rejected anyway.
 *
 * The debounce is what keeps this to one request per name rather than one per
 * keystroke; the query key is the normalised name, so backspacing to something
 * already asked about is answered from cache with no request at all.
 */
export function useUsernameAvailability(input: string): UsernameAvailability {
  const settled = useDebounced(input, DEBOUNCE_MS);

  const username = normalizeUsername(settled);
  const shapeValid = isUsernameShapeValid(settled);

  const { data, isFetching, isError } = useQuery({
    queryKey: queryKeys.usernameAvailability(username),
    queryFn: () => checkUsername(username),
    enabled: shapeValid,
    // The answer is a fact about the whole product, not about this session, and
    // it is cheap to re-ask. Short enough that a name freed a minute ago stops
    // reading as taken.
    staleTime: 30_000,
    retry: false,
    // The field renders its own state; a toast for a failed availability check
    // would interrupt someone mid-word.
    meta: { silent: true },
  });

  // Nothing typed yet: no message, no request, no red text on an empty field
  // somebody has not reached.
  if (!normalizeUsername(input)) return { status: "idle" };

  // Judged on the *live* value so a name that has just become invalid says so
  // immediately, rather than waiting out the debounce showing a stale tick.
  const message = validateUsername(input);

  if (message) return { status: "invalid", message };

  // Valid now, but the debounce has not caught up, so the answer on hand is
  // for a different string.
  if (!shapeValid || username !== normalizeUsername(input) || isFetching) {
    return { status: "checking" };
  }

  if (isError) return { status: "error" };
  if (data === undefined) return { status: "checking" };

  return { status: data ? "available" : "taken" };
}
