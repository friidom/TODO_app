import { describe, expect, it } from "vitest";

import { inviteErrorMessage } from "./inviteError";

describe("inviteErrorMessage", () => {
  it("maps each error code the accept endpoint can return", () => {
    expect(inviteErrorMessage({ code: "bad_request" })).toMatch(/expired/i);
    expect(inviteErrorMessage({ code: "conflict" })).toMatch(
      /already been used/i,
    );
    expect(inviteErrorMessage({ code: "not_found" })).toMatch(/not valid/i);
    expect(inviteErrorMessage({ code: "forbidden" })).toMatch(
      /cannot be accepted/i,
    );
    expect(inviteErrorMessage({ code: "unauthorized" })).toMatch(/sign in/i);
  });

  // The SQLSTATEs the Supabase RPC used to raise reach the client no longer;
  // pinning them as unmapped is what stops the old map creeping back.
  it("does not answer to the SQLSTATEs the old accept_invite RPC raised", () => {
    for (const code of ["22023", "23505", "P0002", "42501", "28000"]) {
      expect(inviteErrorMessage({ code })).toMatch(/could not be accepted/i);
    }
  });

  it("never passes a server message through", () => {
    const raw = {
      status: 500,
      code: "internal",
      message: 'relation "public.board_invites" does not exist',
    };

    const shown = inviteErrorMessage(raw);

    expect(shown).not.toContain("board_invites");
    expect(shown).toMatch(/could not be accepted/i);
  });

  it("survives whatever else a rejected promise carries", () => {
    for (const thrown of [null, undefined, "boom", 42, new Error("network")]) {
      expect(inviteErrorMessage(thrown)).toMatch(/could not be accepted/i);
    }
  });
});
