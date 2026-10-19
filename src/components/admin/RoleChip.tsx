import { useTranslation } from "react-i18next";

// The global role, shown beside a name. Board roles never appear in admin
// lists, so this is the only role chip the area has.
export default function RoleChip() {
  const { t } = useTranslation();

  return (
    <span className="bg-brand-soft text-brand text-micro shrink-0 rounded px-1.5 py-px font-semibold">
      {t("sidebar.superadmin")}
    </span>
  );
}
