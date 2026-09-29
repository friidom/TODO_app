import { useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  statusNameTaken,
  withColumnAdded,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

import NameInput from "./NameInput";
import { ADD_BUTTON, LANE_WIDTH, refocus } from "./workflowChrome";

export default function CreateColumnLane({
  draft,
  edit,
}: {
  draft: WorkflowDraft;
  edit: (change: WorkflowEdit) => boolean;
}) {
  const [creating, setCreating] = useState(false);
  const laneRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();

  function done() {
    setCreating(false);
    refocus(buttonRef);
  }

  return (
    <div
      ref={laneRef}
      className={cn(
        "rounded-surface border-ink/20 shrink-0 self-start border border-dashed p-2",
        LANE_WIDTH,
      )}
    >
      {creating ? (
        <NameInput
          label="New column name"
          placeholder="Column name"
          validate={(name) =>
            statusNameTaken(draft, name)
              ? t("workflow.statusNameTaken", { name })
              : null
          }
          onSubmit={(title) => {
            edit((next) =>
              withColumnAdded(next, {
                columnId: crypto.randomUUID(),
                statusId: crypto.randomUUID(),
                title,
                category: "in_progress",
              }),
            );
            done();
            requestAnimationFrame(() =>
              laneRef.current?.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              }),
            );
          }}
          onCancel={done}
        />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setCreating(true)}
          className={ADD_BUTTON}
        >
          <PlusIcon />
          Create column
        </button>
      )}
    </div>
  );
}
