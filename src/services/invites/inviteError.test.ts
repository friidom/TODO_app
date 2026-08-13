import { describe, expect, it } from "vitest";

import { inviteErrorMessage } from "./inviteError";

describe("inviteErrorMessage", () => {
  it("maps each SQLSTATE accept_invite can raise", () => {
    // The shape PostgrestError actually has: a plain object, not an Error.
    expect(inviteErrorMessage({ code: "22023" })).toMatch(/expired/i);
    expect(inviteErrorMessage({ code: "23505" })).toMatch(/already been used/i);
    expect(inviteErrorMessage({ code: "P0002" })).toMatch(/not valid/i);
    expect(inviteErrorMessage({ code: "42501" })).toMatch(/cannot be accepted/i);
    expect(inviteErrorMessage({ code: "28000" })).toMatch(/sign in/i);
  });

  it("never passes a database message through", () => {
    const raw = {
      code: "P0001",
      message: 'relation "public.board_invites" does not exist',
      details: "somewhere in accept_invite",
      hint: null,
    };

    const shown = inviteErrorMessage(raw);

    expect(shown).not.toContain("board_invites");
    expect(shown).not.toContain("accept_invite");
    expect(shown).toMatch(/could not be accepted/i);
  });

  it("survives whatever else a rejected promise carries", () => {
    for (const thrown of [null, undefined, "boom", 42, new Error("network")]) {
      expect(inviteErrorMessage(thrown)).toMatch(/could not be accepted/i);
    }
  });
});
