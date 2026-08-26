import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `clsx` for conditionals, `tailwind-merge` for conflicts — **taught the three
 * font sizes this product added.**
 *
 * `global.css` defines `--text-micro`, `--text-mini` and `--text-meta` in its
 * `@theme` block, which is how Tailwind v4 mints the `text-micro` / `text-mini`
 * / `text-meta` utilities. tailwind-merge cannot read that CSS: it ships a list
 * of the sizes Tailwind ships, and `text-<anything-else>` falls through to the
 * one other thing `text-` can mean — a colour.
 *
 * So `cn("text-mini …", meta.chip)`, where `meta.chip` is
 * `"bg-status-orange/15 text-status-orange"`, read as two colours in conflict
 * and **dropped the size**. Every priority and work-type chip on every card
 * rendered at the inherited 16px instead of 11px, which is most of why the
 * board looked oversized — and only *some* of it, which is why it looked
 * inconsistent: `text-sm` and friends survived, because tailwind-merge knows
 * those.
 *
 * Registering the three under the `text` theme group is the whole fix. It is
 * the same namespace Tailwind v4 uses for `--text-*`, so the names stay in one
 * place conceptually even though they have to be repeated here — there is no
 * API for handing tailwind-merge the stylesheet.
 *
 * Adding a fourth step to the scale in `global.css` means adding it here too,
 * or it will be dropped exactly the same way and nothing will fail loudly.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "mini", "meta"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
