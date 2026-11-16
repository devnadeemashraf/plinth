import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export interface ChangedFile {
  status: "A" | "M" | "D" | "R";
  path: string;
  oldPath?: string;
}

export function git(args: readonly string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trimEnd();
}

export function tryGit(args: readonly string[]): string | undefined {
  try {
    return git(args);
  } catch {
    return undefined;
  }
}

export function currentBranch(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env["GITHUB_HEAD_REF"]) {
    return env["GITHUB_HEAD_REF"];
  }
  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  return branch === undefined || branch === "HEAD" ? undefined : branch;
}

/** Merge base of HEAD with main. Undefined when there is nothing to compare against. */
export function diffBase(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (tryGit(["rev-parse", "--verify", "HEAD"]) === undefined) {
    return undefined;
  }
  const candidates = [env["PLINTH_BASE_REF"], "origin/main", "main"].filter(
    (ref): ref is string => typeof ref === "string" && ref.length > 0,
  );
  for (const ref of candidates) {
    if (tryGit(["rev-parse", "--verify", `${ref}^{commit}`]) !== undefined) {
      const base = tryGit(["merge-base", "HEAD", ref]);
      if (base !== undefined) {
        return base;
      }
    }
  }
  return undefined;
}

export function parseNameStatus(output: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of output.split("\n")) {
    const parts = line.split("\t");
    const code = parts[0]?.[0];
    if (code === "R" && parts[1] && parts[2]) {
      files.push({ status: "R", oldPath: parts[1], path: parts[2] });
    } else if ((code === "A" || code === "C") && parts.at(-1)) {
      files.push({ status: "A", path: parts.at(-1) as string });
    } else if ((code === "M" || code === "D") && parts[1]) {
      files.push({ status: code, path: parts[1] });
    }
  }
  return files;
}

/** Files changed between base and the working tree, including untracked files. */
export function changedFiles(base: string): ChangedFile[] {
  const tracked = parseNameStatus(git(["diff", "--name-status", "-M", base]));
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .filter((path) => path.length > 0)
    .map((path): ChangedFile => ({ status: "A", path }));
  return [...tracked, ...untracked];
}

export interface DiffLines {
  added: { line: number; text: string }[];
  removed: string[];
}

export function parseUnifiedDiff(diff: string): DiffLines {
  const added: DiffLines["added"] = [];
  const removed: string[] = [];
  let next = 0;
  for (const line of diff.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      next = Number(hunk[1]);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      added.push({ line: next, text: line.slice(1) });
      next += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removed.push(line.slice(1));
    }
  }
  return { added, removed };
}

/** Added and removed lines of one file; an untracked file counts as entirely added. */
export function fileDiffLines(base: string, file: ChangedFile): DiffLines {
  const diff = tryGit(["diff", "-U0", base, "--", file.path]) ?? "";
  if (diff.length === 0 && file.status === "A" && existsSync(file.path)) {
    const text = readFileSync(file.path, "utf8");
    return { added: text.split("\n").map((t, i) => ({ line: i + 1, text: t })), removed: [] };
  }
  return parseUnifiedDiff(diff);
}

/** A file's content at a ref, or undefined if it does not exist there. */
export function showAt(ref: string, path: string): string | undefined {
  return tryGit(["show", `${ref}:${path}`]);
}
