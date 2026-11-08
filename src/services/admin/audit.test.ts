import { describe, expect, it } from "vitest";

import { SYSTEM_ACTOR_ID } from "./access";
import {
  AUDIT_FILTER_PREFIX,
  AUDIT_FILTERS,
  auditActor,
  auditChange,
  auditKind,
  auditTarget,
  isAuditFilter,
} from "./audit";
import type { AuditEntry } from "./types";

const entry = (overrides: Partial<AuditEntry>): AuditEntry => ({
  id: "1",
  actor_id: "actor",
  actor_username: "ann",
  action: "user.superadmin_granted",
  target_type: "user",
  target_id: "target",
  target_username: "bek",
  payload: {},
  created_at: "2026-10-18T02:03:35Z",
  ...overrides,
});

// The six actions the backend writes today (admin.service.ts and
// changeSuperadmin), each with the payload it writes.
const WRITTEN: AuditEntry[] = [
  entry({
    action: "user.superadmin_granted",
    payload: { from: "member", to: "superadmin", via: "admin_panel" },
  }),
  entry({
    action: "user.superadmin_revoked",
    payload: { from: "superadmin", to: "member", via: "admin_panel" },
  }),
  entry({
    action: "user.superadmin_refused",
    payload: { grant: false, reason: "last_superadmin", via: "admin_panel" },
  }),
  entry({ action: "user.seniority_changed", payload: { seniority: "senior" } }),
  entry({
    action: "kpi_target.updated",
    target_type: "kpi_target",
    target_id: "junior",
    target_username: null,
    payload: { daily_points: 6, weekly_points: 30 },
  }),
  entry({
    action: "board.workflow_published",
    target_type: "board",
    target_username: null,
    payload: { from_version: 3, to_version: 4 },
  }),
];

describe("the audit filters", () => {
  it("map onto every action the backend writes, and only those", () => {
    const prefixes = AUDIT_FILTERS.map((filter) => AUDIT_FILTER_PREFIX[filter]);

    expect(prefixes[0]).toBeUndefined();

    for (const written of WRITTEN) {
      const matching = prefixes.filter(
        (prefix) => prefix !== undefined && written.action.startsWith(prefix),
      );

      expect({ action: written.action, matching: matching.length }).toEqual({
        action: written.action,
        matching: 1,
      });
    }
  });

  it("files each written action under exactly the filter that finds it", () => {
    expect(WRITTEN.map((written) => auditKind(written.action))).toEqual([
      "roles",
      "roles",
      "roles",
      "seniority",
      "kpi",
      "workflow",
    ]);
    expect(auditKind("something.else")).toBeNull();
  });

  it("accepts only a known filter from the URL", () => {
    expect(isAuditFilter("roles")).toBe(true);
    expect(isAuditFilter("all")).toBe(true);
    expect(isAuditFilter("drop table")).toBe(false);
    expect(isAuditFilter(null)).toBe(false);
  });
});

describe("auditChange", () => {
  it("puts every written action into words", () => {
    for (const written of WRITTEN) {
      expect(auditChange(written)).not.toBe("");
    }
  });

  it("reads a role change from its payload, and says when the CLI made it", () => {
    expect(auditChange(WRITTEN[0]!)).toBe("Member → Superadmin");
    expect(
      auditChange(
        entry({
          actor_id: SYSTEM_ACTOR_ID,
          payload: { from: "member", to: "superadmin", via: "bootstrap_cli" },
        }),
      ),
    ).toBe("Member → Superadmin · server bootstrap");
  });

  it("explains a refusal with the same words the Access page uses", () => {
    expect(auditChange(WRITTEN[2]!)).toBe("it would have left no superadmin");
  });

  it("reads a cleared level as no level, not as blank", () => {
    expect(
      auditChange(
        entry({
          action: "user.seniority_changed",
          payload: { seniority: null },
        }),
      ),
    ).toBe("No level");
  });

  it("states targets and versions", () => {
    expect(auditChange(WRITTEN[4]!)).toBe("6 per day · 30 per week");
    expect(auditChange(WRITTEN[5]!)).toBe("version 3 → 4");
  });
});

describe("auditActor and auditTarget", () => {
  it("names the bootstrap CLI rather than an all-zero id", () => {
    expect(auditActor(entry({ actor_id: SYSTEM_ACTOR_ID }))).toBe(
      "Server bootstrap",
    );
    expect(auditActor(entry({ actor_username: null }))).toBe(
      "A removed account",
    );
  });

  it("links a person and a board to their admin pages, and only those", () => {
    expect(auditTarget(WRITTEN[0]!)).toEqual({
      label: "bek",
      to: "/admin/users/target",
    });
    expect(auditTarget(WRITTEN[5]!)?.to).toBe("/admin/boards/target");
    expect(auditTarget(WRITTEN[4]!)).toEqual({ label: "Junior" });
    expect(auditTarget(entry({ target_username: null }))?.to).toBeUndefined();
    expect(auditTarget(entry({ target_id: null }))).toBeNull();
  });
});

describe("role names in a change", () => {
  it("reads a reserved role as words rather than its stored name", () => {
    expect(
      auditChange(entry({ payload: { from: "team_lead", to: "superadmin" } })),
    ).toBe("Team lead → Superadmin");
  });
});
