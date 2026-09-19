import { readFileSync } from "node:fs";

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const FUNCTIONAL =
  /^\s*(\/\/\s*(eslint-|@ts-|prettier-|biome-|v8 ignore|c8 ignore|istanbul |#|\/\s*<reference)|\/\*\s*(eslint|global|@ts-|prettier))/;

const COMMENT = /^\s*(\/\/|\/\*|\*(?!\/)\s|\*\/)/;

function addedText(tool, input) {
  if (tool === "Write") return input?.content ?? "";
  if (tool === "Edit") return input?.new_string ?? "";
  if (tool === "MultiEdit")
    return (input?.edits ?? []).map((e) => e?.new_string ?? "").join("\n");
  return "";
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const path = payload?.tool_input?.file_path ?? "";
if (!CODE.test(path) || /\.test\.[cm]?[jt]sx?$/.test(path)) process.exit(0);

const flagged = addedText(payload.tool_name, payload.tool_input)
  .split("\n")
  .filter((line) => COMMENT.test(line) && !FUNCTIONAL.test(line))
  .map((line) => line.trim());

if (flagged.length === 0) process.exit(0);

console.error(
  `CLAUDE.md "Code comments": you just wrote ${flagged.length} comment line(s) in ${path}.\n` +
    flagged.map((l) => `  ${l}`).join("\n") +
    `\n\nFor each one, either state in your reply the non-obvious reason it records ` +
    `(a constraint, a workaround, a choice that looks wrong, a security reason), ` +
    `or edit the file again to delete it. Do not keep a comment that restates the code.`,
);
process.exit(2);
