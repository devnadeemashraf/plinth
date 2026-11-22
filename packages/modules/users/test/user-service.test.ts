import { createTenantId, type StoragePort, type TenantContext } from "@plinth/core";
import {
  InMemoryUserRepository,
  MAX_PROFILE_METADATA_BYTES,
  UserService,
  validateProfileMetadata,
} from "@plinth/modules-users";
import { describe, expect, it } from "vitest";

function createValidPngBuffer(width = 120, height = 120, withExif = false): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;

  const ihdrChunk = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from("IHDR", "ascii"),
    ihdrData,
    Buffer.from([0x12, 0x34, 0x56, 0x78]),
  ]);

  const chunks = [signature, ihdrChunk];

  if (withExif) {
    const exifData = Buffer.from("Sensitive GPS Coordinates: 37.77,-122.41");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(exifData.length, 0);
    chunks.push(
      Buffer.concat([
        len,
        Buffer.from("eXIf", "ascii"),
        exifData,
        Buffer.from([0x00, 0x11, 0x22, 0x33]),
      ]),
    );
  }

  const idatData = Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(idatData.length, 0);
  chunks.push(
    Buffer.concat([
      idatLen,
      Buffer.from("IDAT", "ascii"),
      idatData,
      Buffer.from([0x44, 0x55, 0x66, 0x77]),
    ]),
  );

  chunks.push(
    Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("IEND", "ascii"),
      Buffer.from([0xae, 0x42, 0x60, 0x82]),
    ]),
  );

  return Buffer.concat(chunks);
}

function createMockStorage(): StoragePort & { stored: Map<string, Buffer> } {
  const stored = new Map<string, Buffer>();
  return {
    stored,
    putObject: async (input) => {
      stored.set(input.key, input.body);
      return { key: input.key, url: `https://storage.example.com/${input.key}` };
    },
    getObject: async (input) => {
      const body = stored.get(input.key);
      if (!body) throw new Error("Not found");
      return { key: input.key, body, contentType: "image/png", contentLength: body.length };
    },
    deleteObject: async (input) => {
      stored.delete(input.key);
      return { key: input.key, deleted: true };
    },
    headObject: async (input) => {
      const exists = stored.has(input.key);
      return { exists };
    },
    getSignedUrl: async (input) => ({
      signedUrl: `https://storage.example.com/${input.key}?signed=true`,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    }),
  };
}

describe("UserService (5-Category TDD Matrix)", () => {
  const tenant1: TenantContext = {
    tenantId: createTenantId("tenant-1"),
    slug: "tenant-1",
    mode: "multi",
    isDefault: false,
  };
  const tenant2: TenantContext = {
    tenantId: createTenantId("tenant-2"),
    slug: "tenant-2",
    mode: "multi",
    isDefault: false,
  };

  // 1. Happy Path
  describe("Category 1: Happy Path", () => {
    it("should get and update user profile", async () => {
      const repo = new InMemoryUserRepository();
      const storage = createMockStorage();
      const service = new UserService({ repository: repo, storage });

      await repo.save(tenant1, {
        id: "user-1",
        tenantId: tenant1.tenantId,
        email: "alice@example.com",
        displayName: "Alice",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const profile = await service.getProfile(tenant1, "user-1");
      expect(profile.displayName).toBe("Alice");

      const sameUsernameUpdate = await service.updateProfile(tenant1, "user-1", {
        username: "alice",
        bio: undefined,
        metadata: undefined,
      });
      expect(sameUsernameUpdate.username).toBe("alice");

      const updated = await service.updateProfile(tenant1, "user-1", {
        displayName: "Alice Smith",
        bio: "Principal Engineer",
        locale: "en-GB",
        metadata: { theme: "dark", roleNote: "team lead" },
      });
      expect(updated.displayName).toBe("Alice Smith");
      expect(updated.bio).toBe("Principal Engineer");
      expect(updated.locale).toBe("en-GB");
      expect(updated.metadata).toEqual({ theme: "dark", roleNote: "team lead" });

      // Calling deleteAvatar when user has no avatar should be a no-op
      await service.deleteAvatar(tenant1, "user-1");
      const profileAfterNoopDelete = await service.getProfile(tenant1, "user-1");
      expect(profileAfterNoopDelete.avatarUrl).toBeUndefined();
    });

    it("should upload avatar, strip EXIF metadata, upload to storage, and update avatarUrl", async () => {
      const repo = new InMemoryUserRepository();
      const storage = createMockStorage();
      const service = new UserService({ repository: repo, storage });

      await repo.save(tenant1, {
        id: "user-1",
        tenantId: tenant1.tenantId,
        email: "alice@example.com",
        displayName: "Alice",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const rawWithExif = createValidPngBuffer(100, 100, true);
      expect(rawWithExif.includes(Buffer.from("Sensitive GPS"))).toBe(true);

      const result = await service.uploadAvatar(tenant1, "user-1", rawWithExif);
      expect(result.avatarUrl).toContain("https://storage.example.com/avatars/tenant-1/user-1-");

      // Verify the file stored in Storage Port is stripped of EXIF GPS metadata
      const storedKeys = Array.from(storage.stored.keys());
      expect(storedKeys.length).toBe(1);
      const firstKey = storedKeys[0] ?? "";
      const storedBuffer = storage.stored.get(firstKey);
      expect(storedBuffer).toBeDefined();
      expect(storedBuffer?.includes(Buffer.from("Sensitive GPS"))).toBe(false);

      // Verify profile is updated
      const updatedProfile = await service.getProfile(tenant1, "user-1");
      expect(updatedProfile.avatarUrl).toBe(result.avatarUrl);

      // Re-upload with prior storage:// avatar to verify cleanup of previous avatar
      await repo.update(tenant1, "user-1", {
        avatarUrl: "storage://avatars/tenant-1/old-avatar.png",
      });
      storage.stored.set("avatars/tenant-1/old-avatar.png", Buffer.from("old"));

      const replaced = await service.uploadAvatar(tenant1, "user-1", rawWithExif);
      expect(replaced.avatarUrl).toBeDefined();
      expect(storage.stored.has("avatars/tenant-1/old-avatar.png")).toBe(false);

      // Delete avatar with storage:// URL
      await repo.update(tenant1, "user-1", {
        avatarUrl: "storage://avatars/tenant-1/current.png",
      });
      storage.stored.set("avatars/tenant-1/current.png", Buffer.from("current"));

      await service.deleteAvatar(tenant1, "user-1");
      const clearedProfile = await service.getProfile(tenant1, "user-1");
      expect(clearedProfile.avatarUrl).toBeUndefined();
      expect(storage.stored.has("avatars/tenant-1/current.png")).toBe(false);
    });

    it("should handle storage adapter without public url fallback and non-storage avatar deletion", async () => {
      const repo = new InMemoryUserRepository();
      const storageWithoutUrl: StoragePort = {
        putObject: async (input) => ({ key: input.key }),
        getObject: async () => ({
          key: "",
          body: Buffer.alloc(0),
          contentType: "",
          contentLength: 0,
        }),
        deleteObject: async () => ({ key: "", deleted: true }),
        headObject: async () => ({ exists: false }),
        getSignedUrl: async () => ({ signedUrl: "", expiresAt: new Date() }),
      };
      const service = new UserService({ repository: repo, storage: storageWithoutUrl });

      await repo.save(tenant1, {
        id: "user-no-url",
        tenantId: tenant1.tenantId,
        email: "nourl@example.com",
        displayName: "No Url",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.uploadAvatar(tenant1, "user-no-url", createValidPngBuffer(50, 50));
      expect(res.avatarUrl).toContain("storage://avatars/tenant-1/user-no-url-");

      // Set avatarUrl to a non-storage URL and delete avatar
      await repo.update(tenant1, "user-no-url", {
        avatarUrl: "https://external-cdn.com/avatar.jpg",
      });
      await service.deleteAvatar(tenant1, "user-no-url");
      const cleared = await service.getProfile(tenant1, "user-no-url");
      expect(cleared.avatarUrl).toBeUndefined();

      // Test repo error branches
      await expect(repo.update(tenant1, "non-existent-user", {})).rejects.toThrow("not found");
      const byUser = await repo.getByUsername(tenant1, "non-existent-username");
      expect(byUser).toBeNull();
      repo.clear();
      expect(await repo.getById(tenant1, "user-no-url")).toBeNull();
    });

    it("should emit analytics events when analytics port is provided", async () => {
      const repo = new InMemoryUserRepository();
      const storage = createMockStorage();
      const tracked: string[] = [];
      const analytics = {
        track: async (event: { name: string }) => {
          tracked.push(event.name);
        },
        identify: async () => {},
        flush: async () => {},
        shutdown: async () => {},
      };
      const service = new UserService({ repository: repo, storage, analytics });

      await repo.save(tenant1, {
        id: "user-1",
        tenantId: tenant1.tenantId,
        email: "alice@example.com",
        displayName: "Alice",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.updateProfile(tenant1, "user-1", { displayName: "Alice Analytics" });
      await service.uploadAvatar(tenant1, "user-1", createValidPngBuffer(50, 50));

      expect(tracked).toContain("user.profile_updated");
      expect(tracked).toContain("user.avatar_uploaded");
    });
  });

  // 2. Boundary & Fuzzing
  describe("Category 2: Boundary & Limits", () => {
    it("should reject profile metadata exceeding MAX_PROFILE_METADATA_BYTES (8 KB)", async () => {
      const repo = new InMemoryUserRepository();
      const storage = createMockStorage();
      const service = new UserService({ repository: repo, storage });

      await repo.save(tenant1, {
        id: "user-1",
        tenantId: tenant1.tenantId,
        email: "alice@example.com",
        displayName: "Alice",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const oversizedMetadata = {
        hugeField: "x".repeat(MAX_PROFILE_METADATA_BYTES + 100),
      };

      expect(() => validateProfileMetadata(undefined)).not.toThrow();
      expect(() => validateProfileMetadata({})).not.toThrow();

      await expect(
        service.updateProfile(tenant1, "user-1", {
          metadata: oversizedMetadata,
        }),
      ).rejects.toThrow();
    });
  });

  // 3. Concurrency & Ordering
  describe("Category 3: Concurrency & Duplicate Checks", () => {
    it("should reject username updates that collide with existing usernames in same tenant", async () => {
      const repo = new InMemoryUserRepository();
      const storage = createMockStorage();
      const service = new UserService({ repository: repo, storage });

      await repo.save(tenant1, {
        id: "user-1",
        tenantId: tenant1.tenantId,
        email: "alice@example.com",
        displayName: "Alice",
        username: "alice_w",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await repo.save(tenant1, {
        id: "user-2",
        tenantId: tenant1.tenantId,
        email: "bob@example.com",
        displayName: "Bob",
        username: "bob_m",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.updateProfile(tenant1, "user-2", {
          username: "alice_w",
        }),
      ).rejects.toThrow();
    });
  });

  // 4. Fault Injection
  describe("Category 4: Fault Injection", () => {
    it("should propagate storage failure without corrupting avatarUrl", async () => {
      const repo = new InMemoryUserRepository();
      const failingStorage: StoragePort = {
        putObject: async () => {
          throw new Error("S3 Service Unavailable 503");
        },
        getObject: async () => {
          throw new Error("Failed");
        },
        deleteObject: async () => {
          throw new Error("Failed");
        },
        headObject: async () => ({ exists: false }),
        getSignedUrl: async () => ({ signedUrl: "", expiresAt: new Date() }),
      };

      const service = new UserService({ repository: repo, storage: failingStorage });

      await repo.save(tenant1, {
        id: "user-1",
        tenantId: tenant1.tenantId,
        email: "alice@example.com",
        displayName: "Alice",
        locale: "en-US",
        timezone: "UTC",
        avatarUrl: "https://initial.com/avatar.png",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const raw = createValidPngBuffer(100, 100);
      await expect(service.uploadAvatar(tenant1, "user-1", raw)).rejects.toThrow(
        "S3 Service Unavailable 503",
      );

      // Verify original avatarUrl was not overwritten
      const profile = await service.getProfile(tenant1, "user-1");
      expect(profile.avatarUrl).toBe("https://initial.com/avatar.png");
    });
  });

  // 5. Security & Isolation
  describe("Category 5: Security & Multi-Tenancy Isolation", () => {
    it("should prevent cross-tenant access to user profiles", async () => {
      const repo = new InMemoryUserRepository();
      const storage = createMockStorage();
      const service = new UserService({ repository: repo, storage });

      await repo.save(tenant1, {
        id: "user-1",
        tenantId: tenant1.tenantId,
        email: "alice@example.com",
        displayName: "Alice",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Tenant 2 attempts to read Tenant 1's user profile
      await expect(service.getProfile(tenant2, "user-1")).rejects.toThrow("not found");

      // Tenant 2 attempts to update Tenant 1's user profile
      await expect(
        service.updateProfile(tenant2, "user-1", { displayName: "Hacked" }),
      ).rejects.toThrow("not found");
    });

    it("should reject SVG avatar uploads with embedded scripts", async () => {
      const repo = new InMemoryUserRepository();
      const storage = createMockStorage();
      const service = new UserService({ repository: repo, storage });

      await repo.save(tenant1, {
        id: "user-1",
        tenantId: tenant1.tenantId,
        email: "alice@example.com",
        displayName: "Alice",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const maliciousSvg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      await expect(service.uploadAvatar(tenant1, "user-1", maliciousSvg)).rejects.toThrow();
    });
  });
});
