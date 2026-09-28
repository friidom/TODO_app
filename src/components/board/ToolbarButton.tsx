import type { ComponentProps, ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";
import { HEADER_CONTROL, HEADER_CONTROL_ACTIVE } from "./headerControl";

// `collapse` hides the text by container width, which a portalled tooltip can't see — so the tooltip checks at open
// time whether the text is on screen, and only shows once the button has gone icon-only.
export default function ToolbarButton({
  icon,
  label,
  text = label,
  collapse,
  tooltip,
  active = false,
  className,
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  icon: ReactNode;
  label: string;
  text?: ReactNode;
  collapse?: string;
  tooltip?: ReactNode;
  active?: boolean;
}) {
  return (
    <Tooltip
      onOpenChange={(open, details) => {
        if (!open) return;

        const trigger = details.trigger;

        // its own menu or popover is already open underneath
        if (trigger?.getAttribute("aria-expanded") === "true") {
          details.cancel();
          return;
        }

        if (tooltip) return;

        const shown = trigger?.querySelector("[data-toolbar-text]");

        if (shown && shown.getClientRects().length > 0) details.cancel();
      }}
    >
      <TooltipTrigger
        type={type}
        aria-label={label}
        className={cn(
          HEADER_CONTROL,
          "shrink-0 whitespace-nowrap",
          active
            ? HEADER_CONTROL_ACTIVE
            : "aria-expanded:bg-elevated aria-expanded:text-ink",
          className,
        )}
        {...props}
      >
        {icon}
        <span data-toolbar-text className={collapse}>
          {text}
        </span>
        {children}
      </TooltipTrigger>

      <TooltipContent side="bottom">{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}
