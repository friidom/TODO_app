import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CATEGORY_OPTIONS,
  categoryLabelKey,
  categoryOf,
  type ColumnCategory,
} from "@/constants/columns";
import { cn } from "@/utils/cn";

interface Props {
  value: ColumnCategory;
  onChange: (value: ColumnCategory) => void;
}

/**
 * Swatch + label picker for a column's status category.
 *
 * `useTranslation` rather than i18next's bare `t`, so switching language
 * re-renders the label instead of leaving the previous one until something
 * else happens to re-render this.
 */
export default function CategorySelect({ value, onChange }: Props) {
  const { t } = useTranslation();

  const selected = categoryOf(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="border-hairline bg-canvas text-ink focus-visible:border-brand/50 focus-visible:ring-brand/30 rounded-control flex w-full items-center gap-2 border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2"
        aria-label="Status category"
      >
        <span className={cn("size-4 shrink-0 rounded-sm", selected.swatch)} />

        <span className="truncate">{t(categoryLabelKey(value))}</span>

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

              {t(categoryLabelKey(option.value))}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
