import {
  HEADER_CONTROL,
  HEADER_CONTROL_ACTIVE,
} from "@/components/board/headerControl";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import {
  ADMIN_PERIODS,
  PERIOD_HINTS,
  PERIOD_LABELS,
} from "@/services/admin/periods";
import { cn } from "@/utils/cn";

export default function PeriodSelector() {
  const { period, setPeriod } = useAdminPeriod();

  return (
    <div
      role="group"
      aria-label="Reporting period"
      className="flex shrink-0 flex-wrap gap-1"
    >
      {ADMIN_PERIODS.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setPeriod(value)}
          aria-pressed={value === period}
          title={PERIOD_HINTS[value]}
          className={cn(
            HEADER_CONTROL,
            "px-2",
            value === period && HEADER_CONTROL_ACTIVE,
          )}
        >
          {PERIOD_LABELS[value]}
        </button>
      ))}
    </div>
  );
}
