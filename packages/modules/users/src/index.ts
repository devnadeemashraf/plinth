export {
  deleteAvatarRoute,
  getMeRoute,
  updateMeRoute,
} from "./contracts/user-routes.js";
export {
  MAX_PROFILE_METADATA_BYTES,
  type UpdateProfileInput,
  type UserProfile,
  updateProfileSchema,
  validateProfileMetadata,
} from "./domain/user-profile.js";
export { InMemoryUserRepository } from "./infrastructure/in-memory-user-repository.js";
export type { UserRepositoryPort } from "./ports/repository.js";
export {
  UserService,
  type UserServiceDependencies,
} from "./services/user-service.js";
