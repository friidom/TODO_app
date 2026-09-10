import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge can't read global.css's custom text sizes, so text-micro/mini/meta silently fell through as a "color" conflict
// and got dropped. Registering them here is the fix — add any new size in global.css here too, or it'll drop the same way.
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
