// Every write to one work item carries mutationKey ["todo-write"]; this reads
// which item from the shapes those mutations take, so the task header can say
// "Saving…" for its own writes and nobody else's.
export function writtenTodoId(
  variables: unknown,
  scopeId: string | undefined,
): string | null {
  if (typeof variables === "object" && variables !== null) {
    const vars = variables as { id?: unknown; activeTodo?: { id?: unknown } };

    if (typeof vars.id === "string") return vars.id;
    if (typeof vars.activeTodo?.id === "string") return vars.activeTodo.id;
  }

  const scoped = scopeId?.match(/^[a-z-]+:(.+)$/);

  return scoped ? scoped[1]! : null;
}

export type SaveState = "idle" | "saving" | "saved" | "failed";

export interface WriteRecord {
  status: "idle" | "pending" | "success" | "error";
  submittedAt: number;
}

export function latestWrite(writes: WriteRecord[]): WriteRecord | null {
  return writes.reduce<WriteRecord | null>(
    (latest, write) =>
      latest === null || write.submittedAt >= latest.submittedAt
        ? write
        : latest,
    null,
  );
}
