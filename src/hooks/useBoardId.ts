import { useParams } from "react-router";

// raw route param, may be absent or malformed — screen through isUuid before querying with it
export function useBoardId(): string | undefined {
  const { boardId } = useParams<{ boardId: string }>();

  return boardId;
}
