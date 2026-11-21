import {
  type BrandConfig,
  DEFAULT_BRAND_CONFIG,
  mergeBrandConfig,
  type UpdateBrandDto,
} from "@plinth/modules-brand/domain/brand.js";
import type { BrandRepositoryPort } from "@plinth/modules-brand/ports/repository.js";

export class InMemoryBrandRepository implements BrandRepositoryPort {
  #config: BrandConfig = { ...DEFAULT_BRAND_CONFIG };

  async get(): Promise<BrandConfig> {
    return { ...this.#config };
  }

  async update(patch: UpdateBrandDto): Promise<BrandConfig> {
    this.#config = mergeBrandConfig(this.#config, patch);
    return { ...this.#config };
  }
}
