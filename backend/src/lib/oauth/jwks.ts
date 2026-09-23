import { createPublicKey, type KeyObject } from "node:crypto";

import { OAuthProviderError } from "./identity.js";

interface Jwk {
  kid?: unknown;
  kty?: unknown;
  alg?: unknown;
  use?: unknown;
}

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

// Structural rather than DOM's fetch so a test can hand in a plain function.
export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;

// A forged `kid` must not turn into an outbound request per callback, so a
// refetch is rate-limited rather than triggered on demand. Google rotates keys
// on the order of days; a minute of staleness after a rotation costs one failed
// sign-in and a retry.
const REFETCH_COOLDOWN_MS = 60_000;

const FALLBACK_TTL_MS = 3_600_000;

function parseMaxAge(header: string | null): number | null {
  const match = header?.match(/max-age=(\d+)/i);

  return match ? Number(match[1]) * 1000 : null;
}

function toKeyMap(payload: unknown): Map<string, KeyObject> {
  const keys = (payload as { keys?: unknown })?.keys;

  if (!Array.isArray(keys)) {
    throw new OAuthProviderError("jwks_malformed", "Could not read the provider's signing keys.");
  }

  const map = new Map<string, KeyObject>();

  for (const key of keys as Jwk[]) {
    // RS256 only. Accepting whatever the document happens to carry is how an
    // unexpected algorithm becomes a verification bypass; the caller pins
    // algorithms too, so this is the second of two gates.
    if (typeof key.kid !== "string" || key.kty !== "RSA") continue;
    if (key.alg !== undefined && key.alg !== "RS256") continue;

    try {
      map.set(key.kid, createPublicKey({ key: key as never, format: "jwk" }));
    } catch {
      // One unusable entry must not cost the whole document.
    }
  }

  return map;
}

export interface RemoteJwks {
  get(kid: string, now: number): Promise<KeyObject>;
}

// Deliberately not a library. The whole job is: fetch a JSON document, keep it
// for its max-age, index by kid, and refetch once when a kid is unknown because
// that is what key rotation looks like. Node parses the JWK itself, so there is
// no JWK-to-PEM arithmetic here to get wrong.
export function createRemoteJwks(url: string, fetchImpl: FetchLike): RemoteJwks {
  let keys = new Map<string, KeyObject>();
  let expiresAt = 0;
  let lastFetchAt = 0;
  let inFlight: Promise<void> | null = null;

  async function refresh(now: number): Promise<void> {
    if (inFlight !== null) return inFlight;

    const pending = (async () => {
      try {
        const response = await fetchImpl(url);

        if (!response.ok) {
          throw new OAuthProviderError(
            "jwks_unavailable",
            "Could not reach the provider's signing keys.",
          );
        }

        keys = toKeyMap(await response.json());
        expiresAt = now + (parseMaxAge(response.headers.get("cache-control")) ?? FALLBACK_TTL_MS);
        lastFetchAt = now;
      } finally {
        inFlight = null;
      }
    })();

    inFlight = pending;

    return pending;
  }

  return {
    async get(kid: string, now: number): Promise<KeyObject> {
      if (keys.size === 0 || now >= expiresAt) {
        try {
          await refresh(now);
        } catch (error) {
          // A merely STALE cache still holds usable keys: Google's rotate over
          // days, while max-age expires in hours. Letting a transient network
          // failure propagate here would break every Google sign-in while
          // perfectly good keys sat in memory. With nothing cached there is
          // no fallback, so that case still fails.
          if (keys.size === 0) throw error;
        }
      }

      const cached = keys.get(kid);

      if (cached !== undefined) return cached;

      // Unknown kid: either a rotation we have not picked up, or a forged
      // header. One refetch tells them apart, and the cooldown stops the
      // forged case becoming an outbound-request amplifier.
      if (now - lastFetchAt >= REFETCH_COOLDOWN_MS) {
        await refresh(now);

        const rotated = keys.get(kid);

        if (rotated !== undefined) return rotated;
      }

      throw new OAuthProviderError(
        "jwks_unknown_kid",
        "The provider signed this response with an unrecognised key.",
      );
    },
  };
}
