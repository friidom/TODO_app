import { useRef, useState } from "react";
import {
  ArrowRightLeftIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TagIcon,
  Trash2Icon,
  UnlinkIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import DropLine from "@/components/dnd/DropLine";
import { useReorderItem } from "@/components/dnd/reorderDnd";
import IconButton from "@/components/ui/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CATEGORY_OPTIONS,
  categoryLabelKey,
  type ColumnCategory,
} from "@/constants/columns";
import {
  statusNameTaken,
  withStatusCategory,
  withStatusDeleted,
  withStatusHidden,
  withStatusMoved,
  withStatusRenamed,
  withStatusUnmapped,
  workItemCount,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

import NameInput from "./NameInput";
import StatusLozenge from "./StatusLozenge";
import { GRIP, SELECT, refocus, workItems } from "./workflowChrome";
import { STATUS_GROUP, laneId } from "./workflowMove";

type DraftStatus = WorkflowDraft["statuses"][number];

export default function StatusChip({
  status,
  draft,
  counts,
  stored,
  edit,
}: {
  status: DraftStatus;
  draft: WorkflowDraft;
  counts: ReadonlyMap<string, number>;
  stored: boolean;
  edit: (change: WorkflowEdit) => boolean;
}) {
  const [mode, setMode] = useState<"idle" | "renaming" | "deleting">("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);
  // What the menu hands focus to as it closes, when an item opened an inline editor.
  const inlineRef = useRef<HTMLElement>(null);
  const { t } = useTranslation();

  const { setNodeRef, handleProps, pointerProps, isDragging, edge } =
    useReorderItem(status.id, {
      group: STATUS_GROUP,
      axis: "y",
      container: laneId(status.column_id),
    });

  const count = workItemCount(draft, status.id, counts);
  const otherColumns = draft.columns.filter(
    (column) => column.id !== status.column_id,
  );

  function close() {
    setMode("idle");
    refocus(triggerRef);
  }

  function remove() {
    if (count > 0) setMode("deleting");
    else edit((next) => withStatusDeleted(next, status.id, null, { stored }));
  }

  return (
    <li
      ref={setNodeRef}
      {...pointerProps}
      className={cn(
        "border-hairline bg-elevated rounded-control shadow-e1 relative border select-none",
        isDragging && "opacity-40",
      )}
    >
      <DropLine
        edge={edge}
        axis="y"
        className={edge === "before" ? "-top-1" : "-bottom-1"}
      />

      <div className="flex items-start gap-1 py-1.5 pr-1 pl-0.5">
        <button
          type="button"
          {...handleProps}
          aria-label={`Reorder ${status.name} status`}
          className={GRIP}
        >
          <GripVerticalIcon />
        </button>

        <div className="min-w-0 flex-1 pt-1">
          {mode === "renaming" ? (
            <NameInput
              ref={(node) => {
                inlineRef.current = node;
              }}
              initial={status.name}
              label="Status name"
              validate={(name) =>
                statusNameTaken(draft, name, status.id)
                  ? t("workflow.statusNameTaken", { name })
                  : null
              }
              onSubmit={(name) => {
                edit((next) => withStatusRenamed(next, status.id, name));
                close();
              }}
              onCancel={close}
            />
          ) : (
            <StatusLozenge
              name={status.name}
              category={status.category}
              hidden={status.is_hidden}
            />
          )}

          <p className="text-ink-3 text-mini mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{workItems(count)}</span>

            {status.is_hidden && (
              <span className="inline-flex items-center gap-1">
                <EyeOffIcon className="size-3" aria-hidden />
                Hidden
              </span>
            )}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            ref={triggerRef}
            render={
              <IconButton
                label={`${status.name} status actions`}
                data-no-drag
                className={cn(mode === "renaming" && "invisible")}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="min-w-44"
            finalFocus={() => inlineRef.current ?? true}
          >
            <DropdownMenuItem onClick={() => setMode("renaming")}>
              <PencilIcon />
              Rename
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <TagIcon />
                Category
              </DropdownMenuSubTrigger>

              <DropdownMenuSubContent className="w-44">
                <DropdownMenuRadioGroup
                  value={status.category}
                  onValueChange={(category) =>
                    edit((next) =>
                      withStatusCategory(
                        next,
                        status.id,
                        category as ColumnCategory,
                      ),
                    )
                  }
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                    >
                      <span className={cn("size-2 rounded-full", option.dot)} />
                      {t(categoryLabelKey(option.value))}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuItem
              onClick={() =>
                edit((next) =>
                  withStatusHidden(next, status.id, !status.is_hidden),
                )
              }
            >
              {status.is_hidden ? <EyeIcon /> : <EyeOffIcon />}
              {status.is_hidden ? "Show" : "Hide"}
            </DropdownMenuItem>

            {otherColumns.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArrowRightLeftIcon />
                  Move to
                </DropdownMenuSubTrigger>

                <DropdownMenuSubContent className="w-48">
                  {otherColumns.map((column) => (
                    <DropdownMenuItem
                      key={column.id}
                      onClick={() =>
                        edit((next) =>
                          withStatusMoved(
                            next,
                            status.id,
                            column.id,
                            Number.POSITIVE_INFINITY,
                          ),
                        )
                      }
                    >
                      <span className="truncate">{column.title}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {status.column_id !== null && (
              <DropdownMenuItem
                onClick={() =>
                  edit((next) => withStatusUnmapped(next, status.id))
                }
              >
                <UnlinkIcon />
                Unmap from column
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem variant="destructive" onClick={remove}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {mode === "deleting" && (
        <DeleteConfirm
          status={status}
          count={count}
          draft={draft}
          selectRef={(node) => {
            inlineRef.current = node;
          }}
          onConfirm={(target) =>
            edit((next) =>
              withStatusDeleted(next, status.id, target, { stored }),
            )
          }
          onCancel={close}
        />
      )}
    </li>
  );
}

function DeleteConfirm({
  status,
  count,
  draft,
  selectRef,
  onConfirm,
  onCancel,
}: {
  status: DraftStatus;
  count: number;
  draft: WorkflowDraft;
  selectRef: (node: HTMLSelectElement | null) => void;
  onConfirm: (target: string) => void;
  onCancel: () => void;
}) {
  const targets = draft.statuses.filter(
    (it) => it.id !== status.id && !it.is_hidden && it.column_id !== null,
  );
  const [target, setTarget] = useState(
    () =>
      (targets.find((it) => it.column_id === status.column_id) ?? targets[0])
        ?.id ?? "",
  );
  const chosen = targets.some((it) => it.id === target) ? target : "";

  return (
    <div
      role="group"
      data-no-drag
      aria-label={`Delete ${status.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="border-hairline border-t px-2 pt-2 pb-2"
    >
      {targets.length ? (
        <>
          <label
            htmlFor={`move-${status.id}`}
            className="text-ink-2 text-mini mb-1 block font-medium"
          >
            Move {workItems(count)} to
          </label>

          <select
            id={`move-${status.id}`}
            ref={selectRef}
            autoFocus
            value={chosen}
            onChange={(e) => setTarget(e.target.value)}
            className={SELECT}
          >
            {draft.columns.map((column) => {
              const options = targets.filter(
                (it) => it.column_id === column.id,
              );

              return options.length ? (
                <optgroup key={column.id} label={column.title}>
                  {options.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </>
      ) : (
        <p className="text-ink-2 text-mini leading-snug">
          Its {workItems(count)} need a visible status to move to. Show or add
          one first.
        </p>
      )}

      <div className="mt-2 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="text-ink-2 hover:bg-wash-strong hover:text-ink focus-visible:ring-brand rounded-control text-mini h-7 px-2.5 font-medium outline-none focus-visible:ring-2"
        >
          Cancel
        </button>

        <button
          type="button"
          disabled={!chosen}
          onClick={() => onConfirm(chosen)}
          className="bg-status-red hover:bg-status-red/90 focus-visible:ring-status-red rounded-control text-mini h-7 px-2.5 font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
