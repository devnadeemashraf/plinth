const EXPORT =
  /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|function\*?|class|abstract class|interface|type)\s+([A-Za-z0-9_$]+)/gm;
const REEXPORT = /^export\s+(?:type\s+)?\{([^}]+)\}/gm;

/** Names a TypeScript module exports, found by pattern (no compiler API needed). */
export function exportedSymbols(source: string): string[] {
  const names = [...source.matchAll(EXPORT)].map((m) => m[1] as string);
  for (const block of source.matchAll(REEXPORT)) {
    for (const part of (block[1] as string).split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .at(-1)
        ?.replace(/^type\s+/, "");
      if (name) {
        names.push(name);
      }
    }
  }
  return [...new Set(names)];
}
