import { useTranslation } from "react-i18next";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import {
  ADMIN_PERIODS,
  PERIOD_HINTS,
  PERIOD_LABELS,
} from "@/services/admin/periods";
import Segmented from "./Segmented";

export default function PeriodSelector() {
  const { t } = useTranslation();
  const { period, setPeriod } = useAdminPeriod();

  return (
    <Segmented
      label={t("admin.reportingPeriod")}
      value={period}
      onChange={setPeriod}
      options={ADMIN_PERIODS.map((value) => ({
        value,
        label: PERIOD_LABELS[value],
        title: PERIOD_HINTS[value],
      }))}
    />
  );
}
