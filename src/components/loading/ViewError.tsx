import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";

import EmptyState from "@/components/ui/EmptyState";
import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";

export default function ViewError({ error }: { error: Error }) {
  const { t } = useTranslation();
  const boardId = useBoardId();
  const queryClient = useQueryClient();

  return (
    <div role="alert" className="grid h-full place-items-center">
      <EmptyState
        icon={CircleAlertIcon}
        title={t("board.loadFailed")}
        hint={error.message}
        action={{
          label: t("common.retry"),
          run: () =>
            void queryClient.refetchQueries({
              queryKey: queryKeys.todos(boardId),
            }),
        }}
      />
    </div>
  );
}
