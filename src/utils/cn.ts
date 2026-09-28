import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge can't read global.css's custom tokens: text-micro/mini/meta fell through as a "color" conflict and got dropped,
// and rounded-control/shadow-e2 were never seen as conflicting with rounded-md/shadow-sm, so both classes survived and stylesheet
// order picked the winner. Add any new text size, radius or shadow token from global.css here too.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "mini", "meta"],
      radius: ["control", "card", "surface"],
      shadow: ["e1", "e2", "e3"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
