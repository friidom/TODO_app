import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StarIcon } from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import type { IconButtonSize } from "@/components/ui/controlChrome";
import { useIsStarred, useToggleStar } from "@/services/stars/useStars";
import { cn } from "@/utils/cn";

// The state is in the shape and aria-pressed, not the colour alone: the orange
// is under 3:1 on some surfaces.
export default function StarButton({
  boardId,
  className,
  tooltipSide,
  size,
}: {
  boardId: string;
  size?: IconButtonSize;
  className?: string;
  tooltipSide?: "top" | "bottom" | "left" | "right";
}) {
  const { t } = useTranslation();
  const starred = useIsStarred(boardId);
  const toggle = useToggleStar(boardId);
  const [popped, setPopped] = useState(0);

  return (
    <IconButton
      label={t(starred ? "starred.unstar" : "starred.star")}
      aria-pressed={starred}
      tooltipSide={tooltipSide}
      size={size}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle.mutate(!starred);
        if (!starred) setPopped((n) => n + 1);
      }}
      className={className}
    >
      <StarIcon
        key={popped}
        className={cn(
          popped > 0 && "star-pop",
          starred && "fill-status-orange text-status-orange",
        )}
      />
    </IconButton>
  );
}
