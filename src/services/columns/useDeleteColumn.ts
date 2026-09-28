import { withColumnDeleted } from "@/services/workflow/draft";
import { usePublishWorkflow } from "@/services/workflow/usePublishWorkflow";

// A workflow publish: the column and its statuses go, and their cards move to
// the status a card dropped on the destination would land in — in the same
// transaction, so a failure leaves nothing half-moved.
export function useDeleteColumn() {
  const publish = usePublishWorkflow();

  const mutate = (
    vars: { id: string; moveToColumnId: string },
    options?: Parameters<typeof publish.mutate>[1],
  ) =>
    publish.mutate(
      (draft) => withColumnDeleted(draft, vars.id, vars.moveToColumnId),
      options,
    );

  return { ...publish, mutate };
}
