// The widest cell, unless it is far wider than the nearest-rank 90th
// percentile: then that one value truncates instead of stretching the column.
export function fitWidth(
  header: number,
  cells: readonly number[],
  min: number,
  max: number,
): number {
  const sorted = [...cells].sort((a, b) => a - b);
  const typical = sorted.length
    ? sorted[Math.ceil(sorted.length * 0.9) - 1]
    : 0;
  const widest = sorted.at(-1) ?? 0;
  const content = widest <= typical * 1.5 ? widest : typical;

  return Math.round(Math.min(max, Math.max(min, header, content)));
}

const MAX_MEASURED = 300;

// Evenly spread, so a long list costs one bounded layout and still samples all of it.
export function sample<T>(items: readonly T[], limit = MAX_MEASURED): T[] {
  if (items.length <= limit) return [...items];

  const step = items.length / limit;

  return Array.from({ length: limit }, (_, i) => items[Math.floor(i * step)]);
}

// Body grips stand on the content's bottom edge; --grip-h is how far up they reach,
// kept in step with the content's height without a render.
export function trackGripReach(
  element: HTMLElement,
  above: () => number,
): () => void {
  const observer = new ResizeObserver(() => {
    const reach = Math.max(0, element.offsetHeight - above());

    element.style.setProperty("--grip-h", `${reach}px`);
  });

  observer.observe(element);

  return () => observer.disconnect();
}

// The width each element's content would take with nothing truncated: copies laid
// out at max-content inside `host`, so they inherit the same fonts, measured in one
// layout and removed before anything paints.
export function naturalWidths(
  elements: readonly HTMLElement[],
  host: HTMLElement,
): number[] {
  const box = document.createElement("div");

  box.style.cssText =
    "position:absolute;top:0;left:0;visibility:hidden;pointer-events:none;width:max-content";

  const copies = elements.map((element) => {
    const copy = element.cloneNode(true) as HTMLElement;

    copy.removeAttribute("id");

    // a lone table cell lays out as nothing; anything else keeps its own
    // display, since a flex cell's gap is part of its width
    if (getComputedStyle(element).display === "table-cell") {
      copy.style.display = "block";
    }

    copy.style.position = "static";
    copy.style.width = "max-content";
    copy.style.minWidth = "0";
    copy.style.maxWidth = "none";
    box.append(copy);

    return copy;
  });

  host.append(box);

  const widths = copies.map((copy) => copy.getBoundingClientRect().width);

  box.remove();

  return widths;
}
