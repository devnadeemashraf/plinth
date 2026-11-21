import type { BrandConfig, UpdateBrandDto } from "@plinth/modules-brand/domain/brand.js";

export interface BrandRepositoryPort {
  get(): Promise<BrandConfig>;
  update(patch: UpdateBrandDto): Promise<BrandConfig>;
}
