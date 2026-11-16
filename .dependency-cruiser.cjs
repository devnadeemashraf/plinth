/** Architecture rules (SPEC §3.3). Run by `pnpm check` stage "arch". */
const notTest = "(__tests__/|\\.test\\.ts$)";

module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    { name: "no-unresolvable", severity: "error", from: {}, to: { couldNotResolve: true } },
    {
      name: "domain-is-pure",
      comment: "domain imports only itself and #platform/kernel",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/domain/", pathNot: notTest },
      to: { pathNot: ["^src/modules/$1/domain/", "^src/platform/kernel/"] },
    },
    {
      name: "application-not-outer-layers",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/application/" },
      to: { path: "^src/modules/$1/(infra|http|jobs)/" },
    },
    {
      name: "infra-not-http",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/infra/" },
      to: { path: "^src/modules/$1/http/" },
    },
    {
      name: "http-not-infra",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/http/" },
      to: { path: "^src/modules/$1/infra/" },
    },
    {
      name: "other-modules-via-index-only",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/[^/]+/.",
        pathNot: ["^src/modules/$1/", "^src/modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "platform-not-modules",
      severity: "error",
      from: { path: "^src/platform/" },
      to: { path: "^src/modules/" },
    },
    {
      name: "kernel-is-pure",
      comment:
        "at run time, kernel imports only itself, node built-ins and zod; types may come from anywhere",
      severity: "error",
      from: { path: "^src/platform/kernel/", pathNot: notTest },
      to: {
        pathNot: ["^src/platform/kernel/", "^node_modules/zod/", "^node:"],
        dependencyTypesNot: ["core", "type-only"],
      },
    },
    {
      name: "nothing-imports-main",
      severity: "error",
      from: { pathNot: "^src/main/" },
      to: { path: "^src/main/" },
    },
    {
      name: "src-not-scripts",
      severity: "error",
      from: { path: "^src/", pathNot: notTest },
      to: { path: "^(scripts|test)/" },
    },
    {
      name: "src-not-dev-dependencies",
      severity: "error",
      from: { path: "^src/", pathNot: notTest },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },
  ],
  options: {
    parser: "swc",
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(node_modules|coverage)/" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "node", "default", "types"],
      extensions: [".ts", ".js", ".json"],
    },
  },
};
