import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/SideBarUI/dropdown-menu";

interface Props {
  onSetLimit: () => void;
  onDelete: () => void;
  /** Omitted at the board's edges, where the move would do nothing. */
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  /** The last column has nowhere to hand its work to. */
  canDelete: boolean;
}

export default function ColumnMenu({
  onSetLimit,
  onDelete,
  onMoveLeft,
  onMoveRight,
  canDelete,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Column actions"
        className="rounded-md p-1 text-gray-600 outline-none hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500"
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
