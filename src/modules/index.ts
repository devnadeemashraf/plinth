import type { ModuleManifest } from "#platform/kernel/module.ts";
import { healthModule } from "./health/index.ts";

export const enabledModules: ModuleManifest[] = [
  healthModule,
  // plinth:modules (generator inserts above)
];
