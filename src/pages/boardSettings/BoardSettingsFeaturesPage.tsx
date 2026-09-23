import BoardSettingsShell, {
  Row,
  Section,
} from "@/components/boardSettings/BoardSettingsShell";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoard } from "@/services/boards/useBoard";
import { useUpdateBoard } from "@/services/boards/useUpdateBoard";
import type { IBoard } from "@/types/data";

export default function BoardSettingsFeaturesPage() {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);

  return (
    <BoardSettingsShell>
      {board ? <Features board={board} /> : null}
    </BoardSettingsShell>
  );
}

function Features({ board }: { board: IBoard }) {
  const updateBoard = useUpdateBoard();

  // No local state and no Save button: useUpdateBoard patches both board caches
  // optimistically and rolls back on failure, so the switch is the setting
  // rather than a draft of it. A rejected write toasts through the MutationCache.
  return (
    <Section title="Planning">
      <Row
        label="Sprints"
        hint="Plan work in fixed time periods. The board then shows the running sprint's work, and the Backlog is where you plan it."
      >
        <Toggle
          label="Sprints"
          checked={board.sprints_enabled}
          busy={updateBoard.isPending}
          onChange={(sprints_enabled) =>
            updateBoard.mutate({ id: board.id, sprints_enabled })
          }
        />
      </Row>

      <Row
        label="Workflow"
        hint="Cards move To do → In progress → In review → Done in order. Turn off to let a card move between any two columns."
      >
        <Toggle
          label="Workflow"
          checked={board.workflow_enabled}
          busy={updateBoard.isPending}
          onChange={(workflow_enabled) =>
            updateBoard.mutate({ id: board.id, workflow_enabled })
          }
        />
      </Row>
    </Section>
  );
}

// A native checkbox styled as a switch — the app's in-use idiom
// (ui/checkbox.tsx has no consumers and carries shadcn tokens this theme does
// not define). role="switch" is what makes it read as on/off to a screen reader.
function Toggle({
  label,
  checked,
  busy,
  onChange,
}: {
  label: string;
  checked: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={
        "focus-visible:ring-brand relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 " +
        (checked ? "bg-brand" : "bg-ink/20")
      }
    >
      <span
        className={
          "size-3.5 rounded-full bg-white shadow-e1 transition-transform " +
          (checked ? "translate-x-4.5" : "translate-x-1")
        }
      />
    </button>
  );
}
