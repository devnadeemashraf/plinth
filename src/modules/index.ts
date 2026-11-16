import type { ModuleManifest } from "#platform/kernel/module.ts";
import { platformModule } from "#platform/platform.module.ts";
import { entitlementsModule } from "./entitlements/index.ts";
import { healthModule } from "./health/index.ts";

export const enabledModules: ModuleManifest[] = [
  platformModule,
  healthModule,
  entitlementsModule,
  // plinth:modules (generator inserts above)
];
