import { useTranslation } from "react-i18next";
import SelectControl from "@/components/admin/SelectControl";
import type { AdminScope } from "@/services/admin/types";

export interface ScopeOption {
  id: string;
  label: string;
}

export default function ScopeFilter({
  scope,
  setScope,
  spaces,
  boards,
}: {
  scope: AdminScope;
  setScope: (next: Partial<AdminScope>) => void;
  spaces: ScopeOption[];
  boards: ScopeOption[];
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-1.5">
      {spaces.length > 0 && (
        <Facet
          label={t("boards.space")}
          all={t("admin.allSpaces")}
          value={scope.space}
          options={spaces}
          onChange={(space) => setScope({ space })}
        />
      )}

      {boards.length > 0 && (
        <Facet
          label={t("sidebar.board")}
          all={t("admin.allBoards")}
          value={scope.board}
          options={boards}
          onChange={(board) => setScope({ board })}
        />
      )}
    </div>
  );
}

function Facet({
  label,
  all,
  value,
  options,
  onChange,
}: {
  label: string;
  all: string;
  value: string | undefined;
  options: ScopeOption[];
  onChange: (next: string | undefined) => void;
}) {
  return (
    <SelectControl
      aria-label={label}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
      active={Boolean(value)}
    >
      <option value="">{all}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </SelectControl>
  );
}
