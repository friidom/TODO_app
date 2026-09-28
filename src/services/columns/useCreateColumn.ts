import type { ColumnCategory } from "@/constants/columns";
import { withColumnAdded } from "@/services/workflow/draft";
import { usePublishWorkflow } from "@/services/workflow/usePublishWorkflow";

// A workflow publish, not a column insert: the column arrives with one status
// of its name and category, so cards can be put in it the moment it exists.
export function useCreateColumn() {
  const publish = usePublishWorkflow();

  const mutate = (
    vars: { title: string; category: ColumnCategory },
    options?: Parameters<typeof publish.mutate>[1],
  ) =>
    publish.mutate(
      (draft) =>
        withColumnAdded(draft, {
          ...vars,
          columnId: crypto.randomUUID(),
          statusId: crypto.randomUUID(),
        }),
      options,
    );

  return { ...publish, mutate };
}
