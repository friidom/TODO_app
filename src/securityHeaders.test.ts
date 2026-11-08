import { describe, expect, it } from "vitest";

import indexHtml from "../index.html?raw";
import nginxConf from "../nginx.conf?raw";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );

  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

describe("nginx.conf's Content-Security-Policy", () => {
  it("allows exactly the inline scripts index.html carries", async () => {
    const scripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    const csp = /Content-Security-Policy "([^"]+)"/.exec(nginxConf)?.[1] ?? "";

    expect(scripts.length).toBeGreaterThan(0);

    for (const [, body] of scripts) {
      expect(csp).toContain(`'sha256-${await sha256(body!)}'`);
    }
  });
});
