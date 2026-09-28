import { withColumnRenamed } from "@/services/workflow/draft";
import { usePublishWorkflow } from "@/services/workflow/usePublishWorkflow";

// A title is the workflow's, so renaming is a publish. See renamedWithColumn
// for when the column's status is renamed with it.
export function useRenameColumn() {
  const publish = usePublishWorkflow();

  const mutate = (
    vars: { id: string; title: string },
    options?: Parameters<typeof publish.mutate>[1],
  ) =>
    publish.mutate(
      (draft) => withColumnRenamed(draft, vars.id, vars.title),
      options,
    );

  return { ...publish, mutate };
}
