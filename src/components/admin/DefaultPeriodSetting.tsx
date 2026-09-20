import { useState } from "react";

import {
  ADMIN_PERIODS,
  PERIOD_HINTS,
  PERIOD_LABELS,
  type AdminPeriod,
} from "@/services/admin/periods";
import {
  readDefaultPeriod,
  writeDefaultPeriod,
} from "@/services/admin/preferences";

export default function DefaultPeriodSetting() {
  const [period, setPeriod] = useState<AdminPeriod>(() => readDefaultPeriod());

  return (
    <select
      value={period}
      aria-label="Default reporting period"
      onChange={(event) => {
        const next = event.target.value as AdminPeriod;

        setPeriod(next);
        writeDefaultPeriod(next);
      }}
      className="border-hairline bg-surface text-ink-2 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control h-9 cursor-pointer border px-2 text-sm transition-colors outline-none focus-visible:ring-2"
    >
      {ADMIN_PERIODS.map((value) => (
        <option key={value} value={value} title={PERIOD_HINTS[value]}>
          {PERIOD_LABELS[value]}
        </option>
      ))}
    </select>
  );
}
