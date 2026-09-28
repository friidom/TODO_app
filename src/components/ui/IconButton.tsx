import type { ComponentProps } from "react";

import {
  ICON_BUTTON,
  ICON_BUTTON_ACTIVE,
  type IconButtonSize,
} from "@/components/ui/controlChrome";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";

type Side = "top" | "bottom" | "left" | "right";

// aria-label is always the label; the tooltip only repeats it for sighted pointer users.
// Composes as a render target: <DropdownMenuTrigger render={<IconButton label=… />}>, or spread useCardPopover's triggerProps.
export default function IconButton({
  label,
  size = "sm",
  active = false,
  tooltip = true,
  tooltipSide = "bottom",
  className,
  type = "button",
  children,
  ...props
}: ComponentProps<"button"> & {
  label: string;
  size?: IconButtonSize;
  active?: boolean;
  tooltip?: boolean;
  tooltipSide?: Side;
}) {
  const classes = cn(
    ICON_BUTTON[size],
    active && ICON_BUTTON_ACTIVE,
    className,
  );

  if (!tooltip) {
    return (
      <button type={type} aria-label={label} className={classes} {...props}>
        {children}
      </button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        type={type}
        aria-label={label}
        className={classes}
        {...props}
      >
        {children}
      </TooltipTrigger>

      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}
