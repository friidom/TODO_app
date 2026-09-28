import { ChevronRightIcon } from "lucide-react";

import { SidebarGroupLabel } from "@/components/ui/SideBarUI/sidebar";
import { cn } from "@/utils/cn";

export default function SectionLabel({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <SidebarGroupLabel
      render={<button type="button" onClick={onToggle} aria-expanded={open} />}
      className="group/label"
    >
      <span>{label}</span>

      <ChevronRightIcon
        className={cn(
          "coarse:opacity-100 opacity-0 transition-[opacity,transform] duration-150 group-hover/label:opacity-100 group-focus-visible/label:opacity-100",
          open ? "rotate-90" : "opacity-100",
        )}
      />
    </SidebarGroupLabel>
  );
}
