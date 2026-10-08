import { useState, type ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";

import { COUNT_CHIP, SECTION_TITLE } from "./detailChrome";
import { cn } from "@/utils/cn";

const KEY_PREFIX = "task:card:";

// Per device, like the other reading habits: a private window throws on access, so every touch is guarded.
function readCollapsed(id: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(id: string, collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(KEY_PREFIX + id, "1");
    else localStorage.removeItem(KEY_PREFIX + id);
  } catch {
    // The card still works for this visit; it just won't be remembered.
  }
}

export default function DetailCard({
  id,
  title,
  summary,
  count,
  children,
}: {
  id: string;
  title: string;
  // Shown beside the title only while collapsed, so a closed card still says what is inside it.
  summary?: string;
  count?: number;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(id));

  function toggle() {
    const next = !collapsed;

    setCollapsed(next);
    writeCollapsed(id, next);
  }

  return (
    <section className="border-hairline bg-surface rounded-card overflow-hidden border">
      <h3>
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={toggle}
          className="hover:bg-wash focus-visible:ring-brand flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <ChevronRightIcon
            className={cn(
              "text-ink-3 size-4 shrink-0 transition-transform duration-150",
              !collapsed && "rotate-90",
            )}
          />

          <span className={cn(SECTION_TITLE, "shrink-0")}>{title}</span>

          {count != null && <span className={COUNT_CHIP}>{count}</span>}

          {collapsed && summary && (
            <span className="text-ink-3 text-mini min-w-0 flex-1 truncate font-normal">
              {summary}
            </span>
          )}
        </button>
      </h3>

      {!collapsed && (
        <div className="border-hairline animate-in fade-in-0 border-t duration-150">
          {children}
        </div>
      )}
    </section>
  );
}
