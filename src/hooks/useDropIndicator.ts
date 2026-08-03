import { useState } from "react";

export interface DropIndicator {
  columnId: string | null;
  index: number;
  top: number;
}

export default function useDropIndicator() {
  const [indicator, setIndicator] = useState<DropIndicator>({
    columnId: null,
    index: -1,
    top: 0,
  });

  return {
    indicator,
    setIndicator,
  };
}