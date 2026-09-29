import { useCallback, useRef, useState } from "react";
import {
  GripVerticalIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import DropLine from "@/components/dnd/DropLine";
import {
  useReorderContainer,
  useReorderItem,
} from "@/components/dnd/reorderDnd";
import { COUNT_CHIP } from "@/components/columns/columnChrome";
import IconButton from "@/components/ui/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoryOf } from "@/constants/columns";
import {
  columnCategoryOf,
  renamedWithColumn,
  statusNameTaken,
  statusesOfColumn,
  withColumnRemoved,
  withColumnRenamed,
  withStatusAdded,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

import NameInput from "./NameInput";
import StatusChip from "./StatusChip";
import { ADD_BUTTON, GRIP, LANE_WIDTH, refocus } from "./workflowChrome";
import { COLUMN_GROUP, STATUS_GROUP, laneId } from "./workflowMove";

export default function WorkflowLane({
  column,
  draft,
  counts,
  storedIds,
  edit,
}: {
  column: WorkflowDraft["columns"][number];
  draft: WorkflowDraft;
  counts: ReadonlyMap<string, number>;
  storedIds: ReadonlySet<string>;
  edit: (change: WorkflowEdit) => boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const titleRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const {
    setNodeRef: setItemRef,
    handleProps,
    pointerProps,
    isDragging,
    edge,
  } = useReorderItem(column.id, { group: COLUMN_GROUP, axis: "x" });

  const { setNodeRef: setContainerRef, isTarget } = useReorderContainer(
    laneId(column.id),
    { group: STATUS_GROUP, axis: "y" },
  );

  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setItemRef(node);
      setContainerRef(node);
    },
    [setItemRef, setContainerRef],
  );

  const statuses = statusesOfColumn(draft, column.id);
  const at = draft.columns.findIndex((it) => it.id === column.id);
  const neighbour = draft.columns[at === 0 ? 1 : at - 1];

  function taken(name: string): string | null {
    return statusNameTaken(draft, name)
      ? t("workflow.statusNameTaken", { name })
      : null;
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.title} column`}
      className={cn(
        "rounded-surface border-hairline bg-surface relative flex min-h-56 shrink-0 flex-col border",
        LANE_WIDTH,
        isDragging && "opacity-40",
      )}
    >
      <DropLine
        edge={edge}
        axis="x"
        className={edge === "before" ? "-left-[7px]" : "-right-[7px]"}
      />

      <header
        {...pointerProps}
        className="flex h-11 shrink-0 items-center gap-1 pr-1.5 pl-1 select-none"
      >
        <button
          type="button"
          {...handleProps}
          aria-label={`Reorder ${column.title} column`}
          className={GRIP}
        >
          <GripVerticalIcon />
        </button>

        {renaming ? (
          <NameInput
            ref={renameRef}
            className="flex-1"
            initial={column.title}
            label="Column name"
            validate={(name) => {
              const carried = renamedWithColumn(draft, column.id);

              return carried && statusNameTaken(draft, name, carried.id)
                ? t("workflow.statusNameTaken", { name })
                : null;
            }}
            onSubmit={(name) => {
              edit((next) => withColumnRenamed(next, column.id, name));
              setRenaming(false);
              refocus(titleRef);
            }}
            onCancel={() => {
              setRenaming(false);
              refocus(titleRef);
            }}
          />
        ) : (
          <button
            ref={titleRef}
            type="button"
            title="Rename column"
            onClick={() => setRenaming(true)}
            className="hover:bg-wash-strong focus-visible:ring-brand rounded-control flex h-7 min-w-0 flex-1 items-center gap-2 px-1.5 text-left transition-colors outline-none focus-visible:ring-2"
          >
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                categoryOf(columnCategoryOf(draft, column.id)).dot,
              )}
            />

            <span className="text-ink-2 text-mini truncate font-semibold tracking-wide uppercase">
              {column.title}
            </span>

            <span
              className={COUNT_CHIP}
              aria-label={`${statuses.length} statuses`}
            >
              {statuses.length}
            </span>
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <IconButton
                label={`${column.title} column actions`}
                data-no-drag
                className={cn(renaming && "invisible")}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="min-w-52"
            finalFocus={() => renameRef.current ?? true}
          >
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <PencilIcon />
              Rename
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              disabled={!neighbour}
              onClick={() => edit((next) => withColumnRemoved(next, column.id))}
            >
              <Trash2Icon />

              <span className="flex min-w-0 flex-col">
                Delete column
                <span className="text-ink-3 text-mini truncate">
                  {!neighbour
                    ? "A board needs at least one column"
                    : statuses.length
                      ? `Its statuses move to ${neighbour.title}`
                      : "It holds no statuses"}
                </span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <ul className="flex flex-col gap-1.5 px-2">
        {statuses.map((status) => (
          <StatusChip
            key={status.id}
            status={status}
            draft={draft}
            counts={counts}
            stored={storedIds.has(status.id)}
            edit={edit}
          />
        ))}
      </ul>

      {statuses.length === 0 && (
        <div
          className={cn(
            "text-ink-3 rounded-control text-mini mx-2 grid min-h-20 place-items-center border border-dashed px-3 text-center transition-colors",
            isTarget
              ? "border-brand bg-brand-soft text-brand"
              : "border-ink/20",
          )}
        >
          Drop statuses here
        </div>
      )}

      <div className="mt-auto px-2 pt-1.5 pb-2">
        {adding ? (
          <NameInput
            label="New status name"
            placeholder="Status name"
            validate={taken}
            onSubmit={(name) => {
              edit((next) =>
                withStatusAdded(next, {
                  id: crypto.randomUUID(),
                  columnId: column.id,
                  name,
                  category: columnCategoryOf(next, column.id),
                }),
              );
              setAdding(false);
              refocus(addRef);
            }}
            onCancel={() => {
              setAdding(false);
              refocus(addRef);
            }}
          />
        ) : (
          <button
            ref={addRef}
            type="button"
            onClick={() => setAdding(true)}
            className={ADD_BUTTON}
          >
            <PlusIcon />
            Add status
          </button>
        )}
      </div>
    </section>
  );
}
