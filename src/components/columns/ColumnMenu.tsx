import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  onSetLimit: () => void;
  onDelete: () => void;
  /** Omitted at the board's edges, where the move would do nothing. */
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  /** The last column has nowhere to hand its work to. */
  canDelete: boolean;
  /** Controlled so the header can keep the trigger visible while it is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ColumnMenu({
  onSetLimit,
  onDelete,
  onMoveLeft,
  onMoveRight,
  canDelete,
  open,
  onOpenChange,
}: Props) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label="Column actions"
        className="rounded p-1 text-ink-2 outline-none hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand"
      >
        <MoreHorizontal size={18} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onClick={onSetLimit}>
          Set column limit
        </DropdownMenuItem>

        {(onMoveLeft || onMoveRight) && <DropdownMenuSeparator />}

        {onMoveLeft && (
          <DropdownMenuItem onClick={onMoveLeft}>
            Move column left
          </DropdownMenuItem>
        )}

        {onMoveRight && (
          <DropdownMenuItem onClick={onMoveRight}>
            Move column right
          </DropdownMenuItem>
        )}

        {canDelete && (
          <>
            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={onDelete}>
              Delete status
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
