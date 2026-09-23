import { describe, expect, it } from "vitest";

import {
  avatarExtension,
  avatarKeyFromUrl,
  avatarStorageKey,
  avatarUrl,
  isAvatarObjectName,
  sniffAvatarMime,
} from "./users.avatar.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP", "latin1"),
]);

const USER = "11111111-1111-4111-8111-111111111111";
const AVATAR = "22222222-2222-4222-8222-222222222222";

describe("sniffAvatarMime", () => {
  it("reads the three formats the picker offers", () => {
    expect(sniffAvatarMime(PNG)).toBe("image/png");
    expect(sniffAvatarMime(JPEG)).toBe("image/jpeg");
    expect(sniffAvatarMime(WEBP)).toBe("image/webp");
  });

  // The whole reason this function exists: multer's mimetype is the
  // Content-Type the client typed, so bytes are the only evidence.
  it("refuses a file that merely claims to be an image", () => {
    expect(sniffAvatarMime(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffAvatarMime(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffAvatarMime(Buffer.from("%PDF-1.7"))).toBeNull();
  });

  // Excluded deliberately: an SVG is a document that can carry script, and
  // avatars are served from this API's own origin.
  it("refuses SVG", () => {
    expect(sniffAvatarMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it("refuses a truncated or empty buffer rather than throwing", () => {
    for (const buffer of [Buffer.alloc(0), Buffer.from([0x89]), Buffer.from("RIFF", "latin1")]) {
      expect(sniffAvatarMime(buffer)).toBeNull();
    }
  });

  // A RIFF container that is not WEBP — an AVI, for instance.
  it("refuses RIFF that is not WEBP", () => {
    const avi = Buffer.concat([
      Buffer.from("RIFF", "latin1"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("AVI ", "latin1"),
    ]);

    expect(sniffAvatarMime(avi)).toBeNull();
  });
});

describe("avatarStorageKey", () => {
  it("is built only from server-minted ids and the sniffed type", () => {
    expect(avatarStorageKey(USER, AVATAR, "image/png")).toBe(`${USER}/${AVATAR}.png`);
    expect(avatarStorageKey(USER, AVATAR, "image/jpeg")).toBe(`${USER}/${AVATAR}.jpg`);
    expect(avatarStorageKey(USER, AVATAR, "image/webp")).toBe(`${USER}/${AVATAR}.webp`);
  });

  it("carries no client-supplied text at all", () => {
    const key = avatarStorageKey(USER, AVATAR, "image/png");

    expect(key.split("/")).toHaveLength(2);
    expect(key).not.toContain("..");
  });

  it("names an extension for every accepted type", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp"] as const) {
      expect(avatarExtension(mime)).toMatch(/^(png|jpg|webp)$/);
    }
  });
});

describe("isAvatarObjectName", () => {
  it("accepts what this server writes", () => {
    for (const ext of ["png", "jpg", "webp"]) {
      expect(isAvatarObjectName(`${AVATAR}.${ext}`)).toBe(true);
    }
  });

  // The object segment arrives from a url and is concatenated into a storage
  // key, so anything that could reach a different prefix must be refused.
  it("refuses traversal and anything else not uuid.ext", () => {
    for (const bad of [
      "../secret.png",
      "..%2fsecret.png",
      `${AVATAR}.svg`,
      `${AVATAR}.png/../../x`,
      `${AVATAR}`,
      "avatar.png",
      "",
      `${AVATAR}.png `,
    ]) {
      expect(isAvatarObjectName(bad), bad).toBe(false);
    }
  });
});

describe("avatarUrl / avatarKeyFromUrl", () => {
  it("round-trips to the key it was built from", () => {
    const url = avatarUrl(USER, AVATAR, "image/png");

    expect(url).toContain(`/users/${USER}/avatar/${AVATAR}.png`);
    expect(avatarKeyFromUrl(url)).toBe(`${USER}/${AVATAR}.png`);
  });

  // The migration case. A profile still holding a Supabase url must have the
  // column cleared without anyone attempting a MinIO delete that would fail.
  it("returns null for a url this server did not write", () => {
    expect(avatarKeyFromUrl(null)).toBeNull();
    expect(
      avatarKeyFromUrl("https://xyz.supabase.co/storage/v1/object/public/avatars/u/avatar.png"),
    ).toBeNull();
    expect(avatarKeyFromUrl("https://evil.test/users/x/avatar/y.png")).toBeNull();
    expect(avatarKeyFromUrl("not a url")).toBeNull();
  });
});
