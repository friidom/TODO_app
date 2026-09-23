import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Same shape as attachments.int.test.ts: an in-memory stand-in for MinIO, so
// the suite asserts ordering and ownership without a live object store. Both
// exports are stubbed because app.ts pulls in the attachments module too.
const storage = vi.hoisted(() => ({
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  failUploadOnce: false,
  failDeleteOnce: false,
}));

vi.mock("../../infrastructure/storage/minio-storage.js", () => {
  const fake = {
    ensureBucket: async () => {},
    upload: async (name: string, body: Uint8Array, contentType: string) => {
      if (storage.failUploadOnce) {
        storage.failUploadOnce = false;

        throw new Error("storage unavailable");
      }

      storage.objects.set(name, { body, contentType });
    },
    download: async (name: string) => {
      const object = storage.objects.get(name);

      if (object === undefined) throw new Error(`NoSuchKey: ${name}`);

      const { Readable } = await import("node:stream");

      return Readable.from(Buffer.from(object.body));
    },
    delete: async (name: string) => {
      if (storage.failDeleteOnce) {
        storage.failDeleteOnce = false;

        throw new Error("storage unavailable");
      }

      storage.objects.delete(name);
    },
    exists: async (name: string) => storage.objects.has(name),
  };

  return { minioStorage: fake, avatarStorage: fake, MinioStorage: class {} };
});

const { prisma } = await import("../../db/prisma.js");
const { disconnect, resetDatabase } = await import("../../testing/db.js");
const { makeUser } = await import("../../testing/fixtures.js");
const { startTestServer } = await import("../../testing/httpClient.js");

const client = await startTestServer();

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);

function form(bytes: Buffer, filename = "photo.png", type = "image/png"): FormData {
  const body = new FormData();

  body.append("file", new File([new Uint8Array(bytes)], filename, { type }));

  return body;
}

function avatarOf(userId: string): Promise<string | null> {
  return prisma.profiles
    .findUniqueOrThrow({ where: { id: userId }, select: { avatar_url: true } })
    .then((row) => row.avatar_url);
}

beforeEach(async () => {
  await resetDatabase();
  storage.objects.clear();
  storage.failUploadOnce = false;
  storage.failDeleteOnce = false;
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

describe("POST /users/me/avatar", () => {
  it("stores the object and writes the profile", async () => {
    const user = await makeUser("avatar");

    const response = await client.postForm<{ id: string; avatar_url: string }>(
      "/api/v1/users/me/avatar",
      form(PNG),
      { token: user.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.avatar_url).toContain(`/users/${user.id}/avatar/`);
    expect(await avatarOf(user.id)).toBe(response.body.avatar_url);

    const [key] = [...storage.objects.keys()];

    // Server-minted, under the caller's own prefix, and the client's
    // "photo.png" appears nowhere in it.
    expect(key.startsWith(`${user.id}/`)).toBe(true);
    expect(key).not.toContain("photo");
    expect(storage.objects.get(key)?.contentType).toBe("image/png");
  });

  it("refuses a file whose bytes are not an image, and stores nothing", async () => {
    const user = await makeUser("liar");

    // Declares image/png; the bytes are HTML.
    const response = await client.postForm(
      "/api/v1/users/me/avatar",
      form(Buffer.from("<html><script>alert(1)</script></html>"), "x.png", "image/png"),
      { token: user.token },
    );

    expect(response.status).toBe(400);
    expect(storage.objects.size).toBe(0);
    expect(await avatarOf(user.id)).toBeNull();
  });

  it("refuses an oversized image", async () => {
    const user = await makeUser("big");

    const huge = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);

    const response = await client.postForm("/api/v1/users/me/avatar", form(huge), {
      token: user.token,
    });

    expect(response.status).toBe(400);
    expect(storage.objects.size).toBe(0);
    expect(await avatarOf(user.id)).toBeNull();
  });

  it("refuses an unauthenticated upload", async () => {
    const response = await client.postForm("/api/v1/users/me/avatar", form(PNG));

    expect(response.status).toBe(401);
    expect(storage.objects.size).toBe(0);
  });

  // There is no id in the path to forge: the route is /users/me/avatar and the
  // key comes from the access token, so one account cannot write another's.
  it("always files the object under the caller's own prefix", async () => {
    const victim = await makeUser("victim");
    const attacker = await makeUser("attacker");

    await client.postForm("/api/v1/users/me/avatar", form(PNG), { token: attacker.token });

    const [key] = [...storage.objects.keys()];

    expect(key.startsWith(`${attacker.id}/`)).toBe(true);
    expect(key.startsWith(`${victim.id}/`)).toBe(false);
    expect(await avatarOf(victim.id)).toBeNull();
  });

  // The column must never name an object that was not stored.
  it("leaves the profile untouched when the upload fails", async () => {
    const user = await makeUser("flaky");

    storage.failUploadOnce = true;

    const response = await client.postForm("/api/v1/users/me/avatar", form(PNG), {
      token: user.token,
    });

    expect(response.status).toBe(500);
    expect(await avatarOf(user.id)).toBeNull();
    expect(storage.objects.size).toBe(0);
  });
});

describe("replacing an avatar", () => {
  it("keeps the old object until the profile points at the new one", async () => {
    const user = await makeUser("replacer");

    const first = await client.postForm<{ avatar_url: string }>(
      "/api/v1/users/me/avatar",
      form(PNG),
      { token: user.token },
    );
    const firstKey = [...storage.objects.keys()][0];

    // The delete of the OLD object fails. The new avatar must still be live.
    storage.failDeleteOnce = true;

    const second = await client.postForm<{ avatar_url: string }>(
      "/api/v1/users/me/avatar",
      form(JPEG, "next.jpg", "image/jpeg"),
      { token: user.token },
    );

    expect(second.status).toBe(200);
    expect(second.body.avatar_url).not.toBe(first.body.avatar_url);
    expect(await avatarOf(user.id)).toBe(second.body.avatar_url);

    // A stranded old object is the acceptable failure here; a profile pointing
    // at nothing would not be.
    expect(storage.objects.has(firstKey)).toBe(true);
  });

  it("removes the previous object once the new one is committed", async () => {
    const user = await makeUser("tidy");

    await client.postForm("/api/v1/users/me/avatar", form(PNG), { token: user.token });
    const firstKey = [...storage.objects.keys()][0];

    await client.postForm("/api/v1/users/me/avatar", form(JPEG, "n.jpg", "image/jpeg"), {
      token: user.token,
    });

    expect(storage.objects.has(firstKey)).toBe(false);
    expect(storage.objects.size).toBe(1);
  });

  // A profile still holding a Supabase url must be replaceable without anyone
  // trying to delete an object that was never in this bucket.
  it("replaces a legacy Supabase avatar without touching storage for it", async () => {
    const user = await makeUser("legacy");

    await prisma.profiles.update({
      where: { id: user.id },
      data: { avatar_url: "https://xyz.supabase.co/storage/v1/object/public/avatars/a/avatar.png" },
    });

    const response = await client.postForm<{ avatar_url: string }>(
      "/api/v1/users/me/avatar",
      form(PNG),
      { token: user.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.avatar_url).toContain("/users/");
    expect(response.body.avatar_url).not.toContain("supabase");
    expect(storage.objects.size).toBe(1);
  });
});

describe("DELETE /users/me/avatar", () => {
  it("clears the column and removes the object", async () => {
    const user = await makeUser("remover");

    await client.postForm("/api/v1/users/me/avatar", form(PNG), { token: user.token });

    const response = await client.del<{ avatar_url: string | null }>(
      "/api/v1/users/me/avatar",
      undefined,
      { token: user.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.avatar_url).toBeNull();
    expect(await avatarOf(user.id)).toBeNull();
    expect(storage.objects.size).toBe(0);
  });

  // Storage being unreachable must not leave the person stuck with an avatar
  // they asked to remove.
  it("still clears the column when the object is already gone", async () => {
    const user = await makeUser("gone");

    await client.postForm("/api/v1/users/me/avatar", form(PNG), { token: user.token });

    storage.objects.clear();
    storage.failDeleteOnce = true;

    const response = await client.del("/api/v1/users/me/avatar", undefined, {
      token: user.token,
    });

    expect(response.status).toBe(200);
    expect(await avatarOf(user.id)).toBeNull();
  });

  it("refuses an unauthenticated removal", async () => {
    const response = await client.del("/api/v1/users/me/avatar");

    expect(response.status).toBe(401);
  });
});

describe("GET /users/:userId/avatar/:object", () => {
  it("serves the stored bytes with the type this server pinned", async () => {
    const user = await makeUser("reader");

    const uploaded = await client.postForm<{ avatar_url: string }>(
      "/api/v1/users/me/avatar",
      form(PNG),
      { token: user.token },
    );

    const path = new URL(uploaded.body.avatar_url).pathname;

    const response = await fetch(`${client.url}${path}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
  });

  it("404s a traversal attempt rather than reading another prefix", async () => {
    const user = await makeUser("prober");

    for (const object of ["..%2F..%2Fsecret.png", "avatar.png", "x.svg"]) {
      const response = await fetch(`${client.url}/api/v1/users/${user.id}/avatar/${object}`);

      expect(response.status, object).toBe(404);
    }
  });

  it("404s an object that does not exist", async () => {
    const user = await makeUser("empty");

    const response = await fetch(
      `${client.url}/api/v1/users/${user.id}/avatar/22222222-2222-4222-8222-222222222222.png`,
    );

    expect(response.status).toBe(404);
  });
});

describe("PATCH /users/me no longer accepts avatar_url", () => {
  // It used to: the client chose the value, so any account could point its
  // avatar at any url, including another user's object.
  it("ignores or refuses an avatar_url in the body", async () => {
    const user = await makeUser("patcher");
    const victim = await makeUser("target");

    await client.postForm("/api/v1/users/me/avatar", form(PNG), { token: victim.token });
    const victimUrl = await avatarOf(victim.id);

    const response = await client.patch("/api/v1/users/me", {
      full_name: "Patcher",
      avatar_url: victimUrl,
    }, { token: user.token });

    expect([200, 400]).toContain(response.status);
    expect(await avatarOf(user.id)).toBeNull();
  });
});
