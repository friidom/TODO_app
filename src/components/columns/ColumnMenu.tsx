import {
  ArrowLeft,
  ArrowRight,
  Gauge,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  onSetLimit?: () => void;
  onDelete: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canDelete: boolean;
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
      <DropdownMenuTrigger render={<IconButton label="Column actions" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-52">
        {onSetLimit && (
          <DropdownMenuItem onClick={onSetLimit}>
            <Gauge />
            Set column limit
          </DropdownMenuItem>
        )}

        {onSetLimit && (onMoveLeft || onMoveRight) && <DropdownMenuSeparator />}

        {onMoveLeft && (
          <DropdownMenuItem onClick={onMoveLeft}>
            <ArrowLeft />
            Move column left
          </DropdownMenuItem>
        )}

        {onMoveRight && (
          <DropdownMenuItem onClick={onMoveRight}>
            <ArrowRight />
            Move column right
          </DropdownMenuItem>
        )}

        {canDelete && (
          <>
            {(onSetLimit || onMoveLeft || onMoveRight) && (
              <DropdownMenuSeparator />
            )}

            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              Delete column
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
