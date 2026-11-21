import {
  type BrandConfig,
  type UpdateBrandDto,
  updateBrandSchema,
} from "@plinth/modules-brand/domain/brand.js";
import type { BrandRepositoryPort } from "@plinth/modules-brand/ports/repository.js";

export class BrandService {
  readonly #repository: BrandRepositoryPort;

  constructor(repository: BrandRepositoryPort) {
    this.#repository = repository;
  }

  async getBrand(): Promise<BrandConfig> {
    return this.#repository.get();
  }

  async updateBrand(patch: UpdateBrandDto): Promise<BrandConfig> {
    const validated = updateBrandSchema.parse(patch);
    return this.#repository.update(validated);
  }
}
