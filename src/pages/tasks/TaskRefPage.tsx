import { useTranslation } from "react-i18next";
import { SearchXIcon } from "lucide-react";
import { Link, Navigate, useParams } from "react-router";

import Loading from "@/components/loading/LoadingPage";
import { useTaskRef } from "@/services/taskRefs/useTaskRef";

export default function TaskRefPage() {
  const { t } = useTranslation();
  const { ref } = useParams<{ ref: string }>();
  const { data, isPending, isError, refetch } = useTaskRef(ref);

  if (ref && isPending) return <Loading />;

  if (data) {
    return (
      <Navigate to={`/boards/${data.board_id}?task=${data.todo_id}`} replace />
    );
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <SearchXIcon className="text-muted-foreground size-10" />

      {isError ? (
        <>
          <p className="text-muted-foreground">{t("errors.somethingBroke")}</p>

          <button
            type="button"
            onClick={() => void refetch()}
            className="bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand rounded-control mt-2 px-5 py-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2"
          >
            {t("errors.reload")}
          </button>
        </>
      ) : (
        <>
          <p className="text-xl font-semibold">{t("taskRef.notFoundTitle")}</p>

          <p className="text-muted-foreground max-w-sm">
            {t("taskRef.notFound")}
          </p>

          <Link
            to="/"
            className="bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand rounded-control mt-2 px-5 py-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2"
          >
            {t("taskRef.home")}
          </Link>
        </>
      )}
    </div>
  );
}
