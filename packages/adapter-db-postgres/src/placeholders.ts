/**
 * Translates standard '?' SQL parameter placeholders into PostgreSQL '$1', '$2', ... placeholders
 * while preserving '?' characters inside string literals ('...') and double-quoted identifiers ("...").
 * Existing '$N' placeholders are respected and subsequent '?' placeholders increment from the highest '$N'.
 */
export function normalizeSqlPlaceholders(sql: string): string {
  // Find highest existing $N parameter if any to avoid parameter collisions
  let maxExistingIndex = 0;
  const existingMatches = sql.matchAll(/\$(\d+)/g);
  for (const match of existingMatches) {
    const num = Number.parseInt(match[1] ?? "0", 10);
    if (!Number.isNaN(num) && num > maxExistingIndex) {
      maxExistingIndex = num;
    }
  }

  let paramIndex = maxExistingIndex + 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let result = "";

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i] ?? "";
    const prevChar = i > 0 ? (sql[i - 1] ?? "") : "";

    if (char === "'" && prevChar !== "\\") {
      inSingleQuote = !inSingleQuote;
      result += char;
    } else if (char === '"' && prevChar !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      result += char;
    } else if (char === "?" && !inSingleQuote && !inDoubleQuote) {
      result += `$${paramIndex++}`;
    } else {
      result += char;
    }
  }

  return result;
}
