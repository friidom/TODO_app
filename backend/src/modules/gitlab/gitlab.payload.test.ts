import { describe, expect, it } from "vitest";

import { PROJECT, ZERO_SHA, mergeRequestPayload, pushPayload, sha } from "../../testing/gitlab.js";
import { parseEvent } from "./gitlab.payload.js";

describe("parseEvent", () => {
  it("reads a push and keeps only what Veylo uses", () => {
    const parsed = parseEvent(pushPayload({ commits: [{ message: "API-23 gitlab webhook test" }] }));

    expect(parsed.kind).toBe("push");

    if (parsed.kind !== "push") return;

    expect(parsed.event.project).toEqual(PROJECT);
    expect(parsed.event.commits).toEqual([
      {
        id: sha("API-23 gitlab webhook test"),
        message: "API-23 gitlab webhook test",
        title: "API-23 gitlab webhook test",
        timestamp: new Date("2026-10-05T18:26:21Z"),
        author: { name: "Ada Lovelace" },
      },
    ]);
    expect(JSON.stringify(parsed.event)).not.toContain("ada@example.invalid");
  });

  it("reads a branch creation with no commits and a zero 'before'", () => {
    const parsed = parseEvent(pushPayload({ ref: "refs/heads/feature/API-23", before: ZERO_SHA, after: sha("tip") }));

    expect(parsed.kind === "push" && parsed.event.commits).toEqual([]);
  });

  it("reads a merge request", () => {
    const parsed = parseEvent(mergeRequestPayload({ iid: 42, title: "API-23 Fix", sourceBranch: "feature/API-23" }));

    expect(parsed.kind === "merge_request" && parsed.event.object_attributes).toEqual({
      iid: 42,
      title: "API-23 Fix",
      description: "",
      state: "opened",
      source_branch: "feature/API-23",
      target_branch: "main",
      updated_at: new Date("2026-10-05T18:27:44.310Z"),
    });
  });

  it("reads GitLab's older timestamp format", () => {
    const parsed = parseEvent(mergeRequestPayload({ title: "x", updatedAt: "2013-12-03 17:23:34 UTC" }));

    expect(parsed.kind === "merge_request" && parsed.event.object_attributes.updated_at).toEqual(
      new Date("2013-12-03T17:23:34Z"),
    );
  });

  it("accepts a merge request without a description", () => {
    expect(parseEvent(mergeRequestPayload({ title: "x", description: null })).kind).toBe("merge_request");
  });

  it.each([
    ["a push with no project", { ...pushPayload(), project: undefined }],
    ["a push with a malformed sha", { ...pushPayload(), after: "not-a-sha" }],
    ["a push whose commit has no timestamp", pushPayload({ commits: [{ message: "x", timestamp: "yesterday" }] })],
    ["a merge request in an unknown state", mergeRequestPayload({ title: "x", state: "approved" })],
    ["a project address that is not a url", { ...pushPayload(), project: { ...PROJECT, web_url: "nope" } }],
    ["null", null],
    ["a string", "push"],
  ])("refuses %s", (_label, payload) => {
    expect(parseEvent(payload)).toEqual({ kind: "invalid" });
  });

  it("passes other events through with their project, if any", () => {
    expect(parseEvent({ object_kind: "tag_push", project: PROJECT })).toEqual({ kind: "other", project: PROJECT });
    expect(parseEvent({ object_kind: "note" })).toEqual({ kind: "other", project: null });
    expect(parseEvent({})).toEqual({ kind: "other", project: null });
  });
});
