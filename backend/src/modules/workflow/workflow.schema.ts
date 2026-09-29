import { z } from "zod";

import { WORKFLOW_STAGES } from "../../lib/workflow.js";

const INT4_MAX = 2_147_483_647;

// The 60 the column-title API has always allowed, and statuses_name_check.
const label = z.string().trim().min(1).max(60);

// The whole workflow as it should be after the publish, not a list of edits:
// a column or status absent from the body is deleted, and array order is the
// order. New rows carry ids the client minted, as todos do, so a status can
// name a column created in the same publish.
export const publishWorkflowSchema = z.object({
  version: z.number().int().min(1).max(INT4_MAX),
  columns: z
    .array(z.object({ id: z.uuid(), title: label }))
    .min(1)
    .max(100),
  statuses: z
    .array(
      z.object({
        id: z.uuid(),
        // null is an unmapped status: in the workflow, shown on no column.
        column_id: z.uuid().nullable(),
        name: label,
        category: z.enum(WORKFLOW_STAGES),
        is_hidden: z.boolean(),
      }),
    )
    .max(300),
  // Every allowed move, as it should be after the publish. A pair absent here
  // is refused. Array order carries no meaning.
  transitions: z
    .array(z.object({ from: z.uuid(), to: z.uuid() }))
    .max(5000),
  // Where the work items of a deleted, in-use status go.
  migrations: z
    .array(z.object({ from: z.uuid(), to: z.uuid() }))
    .max(300)
    .default([]),
});

export type PublishWorkflowInput = z.infer<typeof publishWorkflowSchema>;
