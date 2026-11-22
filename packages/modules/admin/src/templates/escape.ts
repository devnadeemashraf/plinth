const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;

export class RawHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
}

export function rawHtml(value: string): RawHtml {
  return new RawHtml(value);
}

export function escapeHtml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) {
    return "";
  }
  if (unsafe instanceof RawHtml) {
    return unsafe.value;
  }
  const str = typeof unsafe === "string" ? unsafe : String(unsafe);
  return str.replace(HTML_ESCAPE_REGEX, (match) => HTML_ESCAPES[match] ?? match);
}

export function safeHtml(strings: TemplateStringsArray, ...values: readonly unknown[]): string {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i] ?? "";
    if (i < values.length) {
      result += escapeHtml(values[i]);
    }
  }
  return result;
}
