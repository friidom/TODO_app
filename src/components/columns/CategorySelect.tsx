import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/SideBarUI/dropdown-menu";
import {
  CATEGORY_OPTIONS,
  categoryOf,
  type ColumnCategory,
} from "@/constants/columns";
import { cn } from "@/services/lib/utils";

interface Props {
  value: ColumnCategory;
  onChange: (value: ColumnCategory) => void;
}

/** Swatch + label picker for a column's status category. */
export default function CategorySelect({ value, onChange }: Props) {
  const selected = categoryOf(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="border-app flex w-full items-center gap-2 rounded-xl border bg-transparent px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Status category"
      >
        <span className={cn("size-4 shrink-0 rounded-sm", selected.swatch)} />

        <span className="truncate">{selected.label}</span>

        <ChevronDown size={16} className="ml-auto shrink-0 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as ColumnCategory)}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span
                className={cn("size-4 shrink-0 rounded-sm", option.swatch)}
              />

              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
