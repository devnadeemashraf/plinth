function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mustFeatureIds(spec: string): string[] {
  return [...spec.matchAll(/^- (F\d{2}) MUST /gm)].map((m) => m[1] as string);
}

export function featureLine(spec: string, id: string): string | undefined {
  return new RegExp(`^- ${id} .+$`, "m").exec(spec)?.[0];
}

/** Section references like "6.13" or "4" cited as §n in a field. §16 is cited per feature instead. */
export function citedSections(text: string): string[] {
  const refs = [...text.matchAll(/§(\d+(?:\.\d+)?)/g)].map((m) => m[1] as string);
  return [...new Set(refs)].filter((ref) => ref !== "16");
}

/** The text of a SPEC section, from its heading to the next heading of the same or higher level. */
export function specSection(spec: string, ref: string): string | undefined {
  const lines = spec.split(/\r?\n/);
  const isSub = ref.includes(".");
  const heading = isSub
    ? new RegExp(`^###\\s.*?\\b${escapeRegExp(ref)}\\s`)
    : new RegExp(`^##\\s${escapeRegExp(ref)}\\.\\s`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) {
    return undefined;
  }
  const stop = isSub ? /^#{2,3}\s/ : /^##\s/;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (stop.test(lines[i] as string)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}
