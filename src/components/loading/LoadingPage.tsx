export default function Loading() {
  const { t } = useTranslation();

  return (
    <div className="bg-canvas flex h-full min-h-64 w-full flex-1 items-center justify-center">
      <span
        role="status"
        aria-label={t("common.loading")}
        className="border-ink/15 border-t-brand inline-block size-7 animate-spin rounded-full border-2"
      />
    </div>
  );
}
import { useTranslation } from "react-i18next";
