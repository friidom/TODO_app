import i18n from "@/components/i18n";

// screen reader copy for a board drag — pure so it's testable without rendering a board or faking a drag
export function screenReaderInstructions(): string {
  return i18n.t("dnd.instructions");
}

// one-based ("position 1", not 0) — total is gaps (cards + 1), passed in rather than derived here
export function describePosition(
  index: number,
  total: number,
  columnTitle: string,
): string {
  return i18n.t("dnd.positionIn", {
    position: index + 1,
    total,
    column: columnTitle,
  });
}

export function describeColumnPosition(index: number, total: number): string {
  return i18n.t("dnd.position", { position: index + 1, total });
}

// doesn't repeat the key instructions — dnd-kit already read those on focus, repeating them every lift gets announcements turned off
export function announcePickedUp(label: string, at: string | null): string {
  return at
    ? i18n.t("dnd.pickedUpAt", { label, at })
    : i18n.t("dnd.pickedUp", { label });
}

// the null case is real, not silence — no target means back where you started, not broken
export function announceMovedOver(label: string, at: string | null): string {
  return at
    ? i18n.t("dnd.over", { label, at })
    : i18n.t("dnd.notOver", { label });
}

export function announceDropped(label: string, at: string | null): string {
  return at
    ? i18n.t("dnd.dropped", { label, at })
    : i18n.t("dnd.returned", { label });
}

export function announceCancelled(label: string): string {
  return i18n.t("dnd.cancelled", { label });
}

// key leads (disambiguates two cards titled the same); falls back to just the title while the key's still in flight
export function itemLabel(key: string | null, title: string | null): string {
  return [key, title].filter(Boolean).join(", ") || i18n.t("dnd.untitledItem");
}
