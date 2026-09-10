import { useState } from "react";
import { Loader2 } from "lucide-react";

import Modal from "@/components/ui/Modal";
import {
  DIALOG_ACTIONS,
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_ERROR,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { FIELD_INPUT, FIELD_INPUT_INVALID } from "@/components/ui/fieldInput";
import { useCreateSpace } from "@/services/spaces/useCreateSpace";
import { useUpdateSpace } from "@/services/spaces/useUpdateSpace";
import type { ISpace } from "@/types/data";
import { cn } from "@/utils/cn";

// space present means rename; the parent unmounts this on close so the field resets for free.
export default function SpaceFormModal({
  space,
  onClose,
}: {
  space?: ISpace;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(space?.title ?? "");

  const createSpace = useCreateSpace();
  const updateSpace = useUpdateSpace();

  const mutation = space ? updateSpace : createSpace;
  const trimmed = title.trim();

  // mirrors the DB's 60-char constraint so this fails as a disabled button, not a server error
  const tooLong = trimmed.length > 60;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!trimmed || tooLong) return;

    if (space) {
      updateSpace.mutate(
        { id: space.id, title: trimmed },
        { onSuccess: onClose },
      );
    } else {
      createSpace.mutate({ title: trimmed }, { onSuccess: onClose });
    }
  }

  return (
    <Modal title={space ? "Rename space" : "Create space"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className={DIALOG_TITLE}>
          {space ? "Rename space" : "Create space"}
        </h2>

        <p className="text-ink-3 text-meta mt-1 mb-5">
          A space is a folder for your boards. It does not change who can see
          them.
        </p>

        <label
          htmlFor="space-title"
          className="text-ink-2 text-meta mb-1.5 block font-medium"
        >
          Name
        </label>

        <input
          id="space-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          aria-invalid={tooLong}
          className={cn(FIELD_INPUT, tooLong && FIELD_INPUT_INVALID)}
          placeholder="Work, Personal, Clients…"
        />

        {tooLong && (
          <p className="text-status-red mt-1.5 text-xs">
            Keep it to 60 characters or fewer.
          </p>
        )}

        {mutation.error && (
          <p role="alert" className={DIALOG_ERROR}>
            {mutation.error.message}
          </p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            Cancel
          </button>

          <button
            type="submit"
            disabled={!trimmed || tooLong || mutation.isPending}
            className={DIALOG_CONFIRM}
          >
            {mutation.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {mutation.isPending
              ? space
                ? "Saving…"
                : "Creating…"
              : space
                ? "Save"
                : "Create space"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
