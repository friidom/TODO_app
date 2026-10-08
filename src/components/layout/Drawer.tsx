import { useTranslation } from "react-i18next";
import { useEffect, type ReactNode } from "react";
import { XIcon } from "lucide-react";

import IconButton from "@/components/ui/IconButton";

// pushes the board at xl, overlays with a scrim below it — no room to push without squeezing the board into a gutter
export default function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className="fixed inset-0 z-40 bg-black/40 xl:hidden"
      />

      <aside
        aria-label={title}
        className="border-hairline bg-rail animate-in fade-in-0 slide-in-from-right-4 fixed inset-y-0 right-0 z-50 flex w-[min(24rem,100vw)] shrink-0 flex-col border-l duration-200 xl:static xl:z-auto xl:w-[22rem]"
      >
        <header className="border-hairline flex h-14 shrink-0 items-center gap-2 border-b pr-3 pl-5">
          <h2 className="text-ink truncate text-base font-semibold">{title}</h2>

          <IconButton
            label={t("common.close")}
            size="md"
            onClick={onClose}
            className="ml-auto"
          >
            <XIcon />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
