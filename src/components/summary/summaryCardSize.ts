import { createContext } from "react";

// The admin area's cards carry larger titles than a board's Summary view; the
// admin layout provides "roomy" so the board's cards stay as they are.
export const SummaryCardSize = createContext<"compact" | "roomy">("compact");
