import { useTranslation } from "react-i18next";

import { useSkeletonFade } from "./skeletonFade";

export default function Loading() {
  const { t } = useTranslation();
  const fade = useSkeletonFade<HTMLDivElement>();

  return (
    <div
      ref={fade}
      className="bg-canvas skeleton-in flex min-h-svh w-full flex-1 items-center justify-center"
    >
      <span
        role="status"
        aria-label={t("common.loading")}
        className="border-ink/15 border-t-brand inline-block size-7 animate-spin rounded-full border-2"
      />
    </div>
  );
}
