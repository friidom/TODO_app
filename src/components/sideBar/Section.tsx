import type { PointerEventHandler, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon, GripVerticalIcon } from "lucide-react";

import DropLine from "@/components/dnd/DropLine";
import { useReorderItem } from "@/components/dnd/reorderDnd";
import {
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/SideBarUI/sidebar";
import { SIDEBAR_DND, type SidebarSection } from "@/services/sidebar/layout";
import { cn } from "@/utils/cn";
import { REORDER_KEYS, stepKey } from "./stepKey";

// Pointer-only by design: the keyboard reorders with Alt+↑/↓ on the row itself,
// so a grip per row would add no access, only a tab stop.
export function Grip({
  onPointerDown,
  className,
}: {
  onPointerDown?: PointerEventHandler;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <span
      aria-hidden
      title={t("sidebar.reorderHint")}
      onPointerDown={onPointerDown}
      className={cn(
        "text-ink-3 hover:text-ink coarse:hidden absolute top-1/2 z-10 grid h-6 w-4 -translate-y-1/2 cursor-grab place-items-center opacity-0 transition-opacity duration-150 group-hover/menu-item:opacity-100 active:cursor-grabbing",
        className,
      )}
    >
      <GripVerticalIcon className="size-3" />
    </span>
  );
}

// Closed rows stay mounted but inert, so Tab skips them; -mx/px keeps the
// clip off their focus rings.
export function Collapse({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      inert={!open}
      className={cn(
        "ease-emphasized grid transition-[grid-template-rows,visibility] duration-200",
        open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
      )}
    >
      <div className="-mx-1 min-h-0 overflow-hidden px-1">{children}</div>
    </div>
  );
}

export default function Section({
  id,
  label,
  open,
  onToggle,
  onStep,
  actions,
  children,
}: {
  id: SidebarSection;
  label: string;
  open: boolean;
  onToggle: () => void;
  onStep: (delta: -1 | 1) => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, pointerProps, isDragging, edge } = useReorderItem(id, {
    group: SIDEBAR_DND.section,
    axis: "y",
  });

  return (
    <div
      ref={setNodeRef}
      className={cn("relative transition-opacity", isDragging && "opacity-40")}
    >
      <SidebarGroup>
        <div className="group/menu-item relative flex items-center">
          <Grip {...pointerProps} className="-left-2" />

          <SidebarGroupLabel
            render={
              <button
                type="button"
                onClick={onToggle}
                onKeyDown={stepKey(onStep)}
                aria-keyshortcuts={REORDER_KEYS}
                aria-expanded={open}
              />
            }
            className="group/label min-w-0 flex-1"
          >
            <span className="truncate">{label}</span>

            <ChevronRightIcon
              className={cn(
                "coarse:opacity-100 transition-[opacity,rotate] duration-150 group-hover/label:opacity-100 group-focus-visible/label:opacity-100",
                open ? "rotate-90 opacity-0" : "opacity-100",
              )}
            />
          </SidebarGroupLabel>

          {actions && (
            <div className="flex shrink-0 items-center">{actions}</div>
          )}
        </div>

        <Collapse open={open}>{children}</Collapse>
      </SidebarGroup>

      <DropLine edge={edge} axis="y" />
    </div>
  );
}
