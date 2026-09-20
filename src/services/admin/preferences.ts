import { DEFAULT_PERIOD, isAdminPeriod, type AdminPeriod } from "./periods";

const KEY = "admin:default-period";

// Per-device, like the theme: which window the admin screens open on is a
// habit of the person reading them, not a fact about the organisation, so it
// does not belong in the database.
//
// Reads and writes are guarded because localStorage throws rather than
// returning null in a private window with site data blocked, and an admin
// screen must not fail to render over a remembered preference.
export function readDefaultPeriod(): AdminPeriod {
  try {
    const stored = localStorage.getItem(KEY);

    return isAdminPeriod(stored) ? stored : DEFAULT_PERIOD;
  } catch {
    return DEFAULT_PERIOD;
  }
}

export function writeDefaultPeriod(period: AdminPeriod): void {
  try {
    if (period === DEFAULT_PERIOD) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, period);
  } catch {
    // A preference that cannot be remembered is not worth failing a save for.
  }
}
