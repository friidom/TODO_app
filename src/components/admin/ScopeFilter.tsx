import {
  HEADER_CONTROL,
  HEADER_CONTROL_ACTIVE,
} from "@/components/board/headerControl";
import type { AdminScope } from "@/services/admin/types";
import { cn } from "@/utils/cn";

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
  return (
    <div className="flex flex-wrap gap-1.5">
      {spaces.length > 0 && (
        <Facet
          label="Space"
          all="All spaces"
          value={scope.space}
          options={spaces}
          onChange={(space) => setScope({ space })}
        />
      )}

      {boards.length > 0 && (
        <Facet
          label="Board"
          all="All boards"
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
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
      className={cn(HEADER_CONTROL, "max-w-48", value && HEADER_CONTROL_ACTIVE)}
    >
      <option value="">{all}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
