import { describe, expect, it } from "vitest";

import type {
  Development,
  DevelopmentBranch,
  DevelopmentCommit,
  DevelopmentMergeRequest,
} from "./gitlabApi";
import {
  branchName,
  commitCommand,
  commitTooltip,
  developmentCount,
  editorUrl,
  newBranchUrl,
  orderMergeRequests,
  shortSha,
  spansProjects,
} from "./development";

const SHA = "6b12e8f9c0a4d3e2f1b0a9c8d7e6f5a4b3c2d1e0";

function commit(project_path = "acme/backend"): DevelopmentCommit {
  return {
    sha: SHA,
    title: "API-1 add auth middleware",
    message: "API-1 add auth middleware",
    author_name: "Ada Lovelace",
    committed_at: "2026-10-05T10:00:00.000Z",
    url: `https://gitlab.com/${project_path}/-/commit/${SHA}`,
    project_path,
  };
}

function branch(project_path = "acme/backend"): DevelopmentBranch {
  return {
    name: "feature/API-1-auth",
    head_sha: SHA,
    url: `https://gitlab.com/${project_path}/-/tree/feature/API-1-auth`,
    project_path,
    updated_at: "2026-10-05T10:00:00.000Z",
  };
}

function mergeRequest(project_path = "acme/backend"): DevelopmentMergeRequest {
  return {
    iid: 42,
    title: "API-1 Fix authentication",
    state: "opened",
    source_branch: "feature/API-1-auth",
    target_branch: "main",
    url: `https://gitlab.com/${project_path}/-/merge_requests/42`,
    project_path,
    updated_at: "2026-10-05T10:00:00.000Z",
  };
}

function development(parts: Partial<Development> = {}): Development {
  return {
    connected: true,
    projects: [],
    commits: [],
    branches: [],
    merge_requests: [],
    ...parts,
  };
}

describe("shortSha", () => {
  it("abbreviates to the eight characters GitLab shows", () => {
    expect(shortSha(SHA)).toBe("6b12e8f9");
  });
});

describe("developmentCount", () => {
  it("counts commits, branches and merge requests together", () => {
    expect(developmentCount(development())).toBe(0);
    expect(
      developmentCount(
        development({
          commits: [commit(), commit()],
          branches: [branch()],
          merge_requests: [mergeRequest()],
        }),
      ),
    ).toBe(4);
  });
});

describe("spansProjects", () => {
  it("is false when everything comes from one project", () => {
    expect(spansProjects(development())).toBe(false);
    expect(
      spansProjects(
        development({ commits: [commit()], merge_requests: [mergeRequest()] }),
      ),
    ).toBe(false);
  });

  it("is true once a second project appears, in any of the three lists", () => {
    expect(
      spansProjects(
        development({ commits: [commit()], branches: [branch("acme/web")] }),
      ),
    ).toBe(true);
  });
});

describe("orderMergeRequests", () => {
  it("puts open merge requests first and keeps the newest-first order within a state", () => {
    const newestMerged = {
      ...mergeRequest(),
      iid: 7,
      state: "merged" as const,
    };
    const open = { ...mergeRequest(), iid: 3, state: "opened" as const };
    const closed = { ...mergeRequest(), iid: 9, state: "closed" as const };
    const olderMerged = { ...mergeRequest(), iid: 2, state: "merged" as const };

    expect(
      orderMergeRequests([newestMerged, closed, open, olderMerged]).map(
        (item) => item.iid,
      ),
    ).toEqual([3, 7, 2, 9]);
  });

  it("leaves the list it was given untouched", () => {
    const given = [
      { ...mergeRequest(), iid: 1, state: "merged" as const },
      { ...mergeRequest(), iid: 2, state: "opened" as const },
    ];

    orderMergeRequests(given);

    expect(given.map((item) => item.iid)).toEqual([1, 2]);
  });
});

describe("commitTooltip", () => {
  it("shows a short message whole, without the whitespace around it", () => {
    expect(commitTooltip("API-1 fix login\n\nBody line\n")).toBe(
      "API-1 fix login\n\nBody line",
    );
  });

  it("cuts a long message at 500 characters, never inside an emoji", () => {
    const tooltip = commitTooltip(`${"a".repeat(499)}🚀${"b".repeat(600)}`);

    expect(Array.from(tooltip)).toHaveLength(501);
    expect(tooltip.endsWith("🚀…")).toBe(true);
  });
});

// backend/src/lib/taskRef.ts's TASK_REF_CANDIDATE: what ingestion reads as a key.
const TASK_REF_CANDIDATE = /\b[A-Za-z][A-Za-z0-9_]*-\d+\b/g;

describe("branchName", () => {
  it("follows <type>/<key>-<slug>, with fix/ for a bug", () => {
    expect(branchName("KAN-12", "Fix login form validation", "Task")).toBe(
      "feature/KAN-12-fix-login-form-validation",
    );
    expect(branchName("KAN-12", "Login fails on Safari", "Bug")).toBe(
      "fix/KAN-12-login-fails-on-safari",
    );
  });

  it("transliterates Russian and Uzbek titles", () => {
    expect(branchName("KAN-7", "Исправить форму входа", "Story")).toBe(
      "feature/KAN-7-ispravit-formu-vhoda",
    );
    expect(branchName("KAN-7", "Oʻzbek tili qoʻllanmasi", "Task")).toBe(
      "feature/KAN-7-ozbek-tili-qollanmasi",
    );
  });

  it("is the key alone when nothing in the title survives", () => {
    expect(branchName("KAN-12", "🚀 !!!", "Task")).toBe("feature/KAN-12");
    expect(branchName("KAN-12", null, null)).toBe("feature/KAN-12");
  });

  it("names no task but its own when the title holds a word and a number", () => {
    const name = branchName("API-12", "Migrate to API 2 and Vue 3", "Task");

    expect(name).toBe("feature/API-12-migrate-to-api2-and-vue3");
    expect(name.match(TASK_REF_CANDIDATE)).toEqual(["API-12"]);
  });

  it("cuts a long title at a word boundary", () => {
    expect(branchName("KAN-12", "word ".repeat(30), "Task")).toBe(
      `feature/KAN-12-${Array(10).fill("word").join("-")}`,
    );
  });
});

describe("commitCommand", () => {
  it("starts the message with the task's key", () => {
    expect(commitCommand("KAN-12", "Fix login form validation")).toBe(
      'git commit -m "KAN-12 Fix login form validation"',
    );
  });

  it("leaves nothing a shell would expand or run", () => {
    expect(
      commitCommand("KAN-12", 'Pay $5 "now" `rm -rf ~` $(curl x|sh) \\ !!'),
    ).toBe('git commit -m "KAN-12 Pay 5 now rm -rf ~ (curl x|sh)"');
  });

  it("keeps the message on one line", () => {
    expect(commitCommand("KAN-12", "First\nsecond\u0015third\u000f")).toBe(
      'git commit -m "KAN-12 First second third"',
    );
  });

  it("is the key alone when the title is empty", () => {
    expect(commitCommand("KAN-12", null)).toBe('git commit -m "KAN-12"');
    expect(commitCommand("KAN-12", ' "" ')).toBe('git commit -m "KAN-12"');
  });
});

describe("newBranchUrl", () => {
  it("opens GitLab's new-branch page with the name filled in", () => {
    expect(
      newBranchUrl("https://gitlab.com/acme/backend", "feature/KAN-12-fix"),
    ).toBe(
      "https://gitlab.com/acme/backend/-/branches/new?branch_name=feature%2FKAN-12-fix",
    );
  });
});

describe("editorUrl", () => {
  it("hands VS Code the project's clone address", () => {
    expect(editorUrl("https://gitlab.com/acme/backend")).toBe(
      "vscode://vscode.git/clone?url=https%3A%2F%2Fgitlab.com%2Facme%2Fbackend.git",
    );
  });
});
