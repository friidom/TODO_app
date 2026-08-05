import { Gauge } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Shown whenever a column's work-item count falls outside its limits. Always
 * visible — unlike the collapse and menu controls, this one is the reason the
 * user needs to look at the header at all.
 */
export default function LimitWarning({
  message,
  side = "bottom",
}: {
  message: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          aria-label={message}
          className="shrink-0 rounded bg-[#ffecea] p-1 text-[#c9372c] outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Gauge size={16} />
        </TooltipTrigger>

        <TooltipContent side={side} className="max-w-64 text-sm">
          {message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
