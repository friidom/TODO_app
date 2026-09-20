import { describe, expect, it } from "vitest";

import { adminRoutes } from "./admin.routes.js";

// The failure this file exists to catch is silent and total: an /admin route
// that forgets requireSuperadmin does not throw, does not 500 and does not
// look wrong in review — it just answers every board in the system to whoever
// asks. A convention cannot be relied on for that, so the list is walked.
//
// Express's router stack is private API. Reading it is the price of checking
// the real chain rather than a hand-kept list that would itself need
// remembering; if a future Express changes the shape, the first assertion
// fails loudly rather than passing vacuously — which is what `expect(routes)
// .not.toHaveLength(0)` is guarding.
interface HandlerLayer {
  name?: string;
  handle?: { name?: string };
}

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: HandlerLayer[] };
}

function handlerNames(layer: HandlerLayer): string {
  return layer.name ?? layer.handle?.name ?? "";
}

const routes = (adminRoutes as unknown as { stack: RouteLayer[] }).stack
  .filter((layer): layer is Required<RouteLayer> => layer.route !== undefined)
  .map((layer) => ({
    label: `${Object.keys(layer.route.methods).join("|").toUpperCase()} ${layer.route.path}`,
    handlers: layer.route.stack.map(handlerNames),
  }));

describe("every /admin route is gated", () => {
  it("finds routes to check at all", () => {
    expect(routes).not.toHaveLength(0);
  });

  it.each(routes)("$label carries requireAuth then requireSuperadmin", ({ handlers }) => {
    expect(handlers).toContain("requireAuth");
    expect(handlers).toContain("requireSuperadmin");

    // Order is the assertion, not a tidiness preference: requireSuperadmin
    // calls requireActor, which throws a 500 rather than a 401 when no
    // requireAuth ran in front of it.
    expect(handlers.indexOf("requireAuth")).toBeLessThan(handlers.indexOf("requireSuperadmin"));
  });
});
