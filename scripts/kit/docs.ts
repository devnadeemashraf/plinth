/**
 * `pnpm run docs <package>`: pinned version, official docs URL and local type/README paths.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMiseTools } from "./lib/guards.ts";

const name = process.argv[2];
if (!name) {
  console.log("usage: pnpm run docs <package or tool name>");
  process.exit(2);
}

const versions = readFileSync("docs/VERSIONS.md", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const installed =
  pkg.dependencies?.[name] ??
  pkg.devDependencies?.[name] ??
  parseMiseTools(readFileSync("mise.toml", "utf8"))[name];

const line = versions.split("\n").find((l) => l.startsWith(`- \`${name}\``));
if (!line) {
  console.log(`"${name}" is not in docs/VERSIONS.md.`);
  console.log("Find its official documentation. Add it only if your item names this dependency.");
  process.exit(1);
}
const planned = /^- `[^`]+` (\S+) — /.exec(line)?.[1];
const version = installed ?? planned ?? "unknown";
const url = /(https?:\/\/\S+)/.exec(line)?.[1]?.replaceAll("{version}", version);

console.log(`${name} ${version}${installed ? "" : " (planned, not installed yet)"}`);
console.log(`docs: ${url ?? "no URL recorded"}`);
const dir = join("node_modules", name);
if (existsSync(join(dir, "package.json"))) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    types?: string;
    typings?: string;
  };
  const types = manifest.types ?? manifest.typings;
  if (types) {
    console.log(`types: ${join(dir, types).replaceAll("\\", "/")}`);
  }
  if (existsSync(join(dir, "README.md"))) {
    console.log(`readme: ${join(dir, "README.md").replaceAll("\\", "/")}`);
  }
}
