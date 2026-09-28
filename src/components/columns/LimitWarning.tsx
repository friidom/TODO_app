import { Gauge } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function LimitWarning({
  message,
  side = "bottom",
}: {
  message: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={message}
        className="bg-status-red/15 text-status-red focus-visible:ring-brand rounded-control coarse:size-8 grid size-7 shrink-0 place-items-center outline-none focus-visible:ring-2"
      >
        <Gauge className="size-4" />
      </TooltipTrigger>

      <TooltipContent side={side} className="max-w-64">
        {message}
      </TooltipContent>
    </Tooltip>
  );
}
