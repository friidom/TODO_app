import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { IWorkflow } from "@/types/data";

import { draftOf, type WorkflowDraft } from "./draft";
import { toWorkflowModel } from "./statuses";
import { workflowQuery } from "./useWorkflow";
import { publishWorkflow } from "./workflowApi";

// null when the edit cannot apply to the snapshot it is given.
export type WorkflowEdit = (draft: WorkflowDraft) => WorkflowDraft | null;

// Every workflow change goes through here — the one write path PUT
// /boards/:boardId/workflow has. The edit is applied to the snapshot that is
// newest when the publish actually runs, not when it was asked for.
export function usePublishWorkflow() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const { t } = useTranslation();

  return useMutation({
    // One queue per board, so two quick edits publish in order and the second
    // is built on the version the first returned instead of the one it spent.
    scope: { id: `workflow:${boardId}` },

    mutationFn: async (edit: WorkflowEdit) => {
      if (!boardId)
        throw new Error("the workflow was published without a board");

      const current = await queryClient.ensureQueryData<IWorkflow>(
        workflowQuery(boardId),
      );
      const draft = edit(draftOf(toWorkflowModel(current)));

      if (draft === null) throw new Error(t("workflow.editStale"));

      return publishWorkflow(boardId, draft);
    },

    onSuccess: (workflow) => {
      queryClient.setQueryData<IWorkflow>(
        queryKeys.workflow(boardId),
        workflow,
      );

      // A category change restamps the cards in that status and a deletion
      // moves cards, so the cards are refetched rather than guessed.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.todos(boardId),
      });
    },

    // 409 is a snapshot someone else has already replaced; refetching is what
    // lets the next attempt succeed. The toast comes from the MutationCache.
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workflow(boardId),
      });
    },
  });
}
