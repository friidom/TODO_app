import { z } from "zod";

// 'owner' is absent by construction, not filtered out: ownership is not
// grantable through membership management, and a value that cannot be spelled
// cannot be smuggled. assignableRoles() refuses it again in the service.
const assignableRole = z.enum(["viewer", "editor", "admin"]);

export const addMemberSchema = z.object({
  user_id: z.uuid(),
  role: assignableRole,
});

export const setMemberRoleSchema = z.object({ role: assignableRole });

export const memberParamsSchema = z.object({ userId: z.uuid() });

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type SetMemberRoleInput = z.infer<typeof setMemberRoleSchema>;
export type MemberParams = z.infer<typeof memberParamsSchema>;
