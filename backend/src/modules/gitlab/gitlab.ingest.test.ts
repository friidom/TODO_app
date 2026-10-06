import { describe, expect, it } from "vitest";

import { ZERO_SHA, mergeRequestPayload, pushPayload, sha } from "../../testing/gitlab.js";
import { branchCandidate, clip, commitCandidates, mergeRequestCandidate } from "./gitlab.ingest.js";
import { mergeRequestEventSchema, pushEventSchema } from "./gitlab.payload.js";

const push = (input: Parameters<typeof pushPayload>[0]) => pushEventSchema.parse(pushPayload(input));

describe("commitCandidates", () => {
  it("finds every task a commit names, in its title and its body", () => {
    const [commit] = commitCandidates(
      push({ commits: [{ message: "api-23 fix authentication\n\nAlso touches MNH-7 and API-23 again." }] }),
    );

    expect(commit?.refs.map((ref) => [ref.key, ref.number, ref.text])).toEqual([
      ["API", 23, "api-23"],
      ["MNH", 7, "MNH-7"],
    ]);
    expect(commit).toMatchObject({
      title: "api-23 fix authentication",
      author_name: "Ada Lovelace",
      committed_at: new Date("2026-10-05T18:26:21Z"),
    });
  });

  it("keeps a commit that names no task, with no references", () => {
    expect(commitCandidates(push({ commits: [{ message: "Initial commit" }] }))[0]?.refs).toEqual([]);
  });

  it("cuts an oversized message short instead of refusing it", () => {
    const message = `API-1 ${"x".repeat(20_000)}`;
    const [commit] = commitCandidates(push({ commits: [{ message }] }));

    expect(commit?.message).toHaveLength(10_000);
    expect(commit?.refs.map((ref) => ref.number)).toEqual([1]);
  });
});

describe("branchCandidate", () => {
  it("reads a pushed branch and the tasks its name carries", () => {
    const branch = branchCandidate(push({ ref: "refs/heads/feature/API-23-webhook", after: sha("tip") }));

    expect(branch).toMatchObject({ name: "feature/API-23-webhook", head_sha: sha("tip"), deleted: false });
    expect(branch?.refs.map((ref) => ref.text)).toEqual(["API-23"]);
  });

  it("recognises a deleted branch by its all-zero 'after'", () => {
    expect(branchCandidate(push({ ref: "refs/heads/feature/API-23", after: ZERO_SHA }))?.deleted).toBe(true);
  });

  it("ignores anything that is not a branch", () => {
    expect(branchCandidate(push({ ref: "refs/tags/v1.0.0" }))).toBeNull();
  });
});

describe("mergeRequestCandidate", () => {
  it("collects references from the title, the description and the source branch", () => {
    const candidate = mergeRequestCandidate(
      mergeRequestEventSchema.parse(
        mergeRequestPayload({
          iid: 42,
          title: "API-23 Fix authentication",
          description: "Follows up HOB-4.",
          sourceBranch: "feature/MNH-7-auth",
          state: "merged",
        }),
      ),
    );

    expect(candidate).toMatchObject({ iid: 42, state: "merged", source_branch: "feature/MNH-7-auth" });
    expect(candidate.refs.map((ref) => ref.text)).toEqual(["API-23", "HOB-4", "MNH-7"]);
  });
});

describe("clip", () => {
  it("leaves short text alone and removes NUL, which PostgreSQL cannot store", () => {
    expect(clip("fine", 10)).toBe("fine");
    expect(clip("a\0b", 10)).toBe("ab");
  });

  it("never cuts a character in half", () => {
    expect(clip("ab😀cd", 3)).toBe("ab😀");
  });
});
