import type { ComponentProps } from "react";
import { ChevronDownIcon } from "lucide-react";

import {
  HEADER_CONTROL,
  HEADER_CONTROL_ACTIVE,
} from "@/components/board/headerControl";
import { cn } from "@/utils/cn";

// A native select in the segmented control's height and border, with our own
// chevron: the platform's arrow is what made these read as unstyled.
export default function SelectControl({
  active = false,
  className,
  ...props
}: ComponentProps<"select"> & { active?: boolean }) {
  return (
    <span className={cn("relative inline-flex min-w-0 shrink-0", className)}>
      <select
        {...props}
        className={cn(
          HEADER_CONTROL,
          "h-8 w-full max-w-52 min-w-0 cursor-pointer appearance-none truncate pr-7",
          active && HEADER_CONTROL_ACTIVE,
        )}
      />
      <ChevronDownIcon
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2",
          active ? "text-brand" : "text-ink-3",
        )}
      />
    </span>
  );
}
