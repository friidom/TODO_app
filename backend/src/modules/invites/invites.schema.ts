import { z } from "zod";

import { INVITEE_SEARCH_MIN_CHARS } from "../../config/constants.js";

const invitableRole = z.enum(["viewer", "editor", "admin"]);

// expires_in_days is NOT bounded here. create_invite clamps rather than
// rejects, so a crafted 9999 becomes 30 instead of a 400 — a schema .max()
// would change that behaviour.
export const createInviteSchema = z.object({
  role: invitableRole,
  expires_in_days: z.coerce.number().int().optional(),
  email: z.string().trim().max(254).nullable().optional(),
});

// Exactly one credential. A request carrying both is ambiguous about which one
// was meant to authorize it, and answering it would let a caller pair someone
// else's invite id with a token they do hold.
const credential = z
  .object({
    token: z.string().min(1).max(200).optional(),
    invite_id: z.uuid().optional(),
  })
  .refine(
    (body) => (body.token === undefined) !== (body.invite_id === undefined),
    { message: "give exactly one of token or invite_id" },
  );

export const acceptInviteSchema = credential;
export const declineInviteSchema = credential;

export const inviteParamsSchema = z.object({ inviteId: z.uuid() });

export const inviteeQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
});

export const SEARCH_MIN_CHARS = INVITEE_SEARCH_MIN_CHARS;

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type InviteCredential = z.infer<typeof credential>;
export type InviteParams = z.infer<typeof inviteParamsSchema>;
export type InviteeQuery = z.infer<typeof inviteeQuerySchema>;
