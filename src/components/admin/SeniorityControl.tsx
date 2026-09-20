import { HEADER_CONTROL } from "@/components/board/headerControl";
import { useSaveSeniority } from "@/services/admin/useAdmin";
import { SENIORITIES, type AdminUser, type Seniority } from "@/services/admin/types";

export default function SeniorityControl({ user }: { user: AdminUser }) {
  const save = useSaveSeniority();

  return (
    <label className="flex shrink-0 items-center gap-2">
      <span className="text-ink-3 text-mini">Level</span>

      <select
        aria-label={`Seniority for ${user.username}`}
        className={HEADER_CONTROL}
        value={user.seniority ?? ""}
        disabled={save.isPending}
        onChange={(event) =>
          save.mutate({
            id: user.id,
            // The empty option returns the user to unclassified, which is a
            // real state and not a failure to choose (M34 D-8).
            seniority: event.target.value === "" ? null : (event.target.value as Seniority),
          })
        }
      >
        <option value="">Unclassified</option>
        {SENIORITIES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
}
