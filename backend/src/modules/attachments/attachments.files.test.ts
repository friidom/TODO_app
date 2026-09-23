import { describe, expect, it } from "vitest";

import {
  canRenderInline,
  contentDisposition,
  fileExtension,
  safeFilename,
  storageKey,
} from "./attachments.files.js";

const BOARD = "11111111-1111-4111-8111-111111111111";
const TODO = "22222222-2222-4222-8222-222222222222";
const ATTACHMENT = "33333333-3333-4333-8333-333333333333";

describe("storageKey", () => {
  it("reads back as board/todo/attachment", () => {
    expect(storageKey(BOARD, TODO, ATTACHMENT, "notes.pdf")).toBe(
      `${BOARD}/${TODO}/${ATTACHMENT}.pdf`,
    );
  });

  // The policy boundary: the first segment is the board, so nothing the
  // uploader typed may reach the key.
  it("carries no part of the uploader's filename", () => {
    for (const filename of [
      "../../etc/passwd",
      "a/b/c.png",
      "..%2f..%2fsecret.png",
      "name with spaces.PNG",
      "\u0000null.png",
    ]) {
      const key = storageKey(BOARD, TODO, ATTACHMENT, filename);

      expect(key.split("/")).toHaveLength(3);
      expect(key.startsWith(`${BOARD}/${TODO}/${ATTACHMENT}`)).toBe(true);
    }
  });

  it("drops an extension it cannot vouch for", () => {
    expect(storageKey(BOARD, TODO, ATTACHMENT, "archive.tar.gz")).toBe(
      `${BOARD}/${TODO}/${ATTACHMENT}.gz`,
    );
    expect(storageKey(BOARD, TODO, ATTACHMENT, ".gitignore")).toBe(
      `${BOARD}/${TODO}/${ATTACHMENT}`,
    );
    expect(storageKey(BOARD, TODO, ATTACHMENT, "no-extension")).toBe(
      `${BOARD}/${TODO}/${ATTACHMENT}`,
    );
  });
});

describe("fileExtension", () => {
  it("refuses anything outside [a-z0-9]{1,8}", () => {
    expect(fileExtension("x.p n g")).toBe("");
    expect(fileExtension("x.verylongextension")).toBe("");
    expect(fileExtension("x.")).toBe("");
    expect(fileExtension("x.PNG")).toBe("png");
  });
});

describe("safeFilename", () => {
  it("strips the control characters PostgreSQL refuses", () => {
    expect(safeFilename("re\u0000ze.jpg")).toBe("reze.jpg");
    expect(safeFilename("a\tb\nc.txt")).toBe("abc.txt");
  });

  it("caps the length and never answers blank", () => {
    expect(safeFilename("a".repeat(400))).toHaveLength(255);
    expect(safeFilename("   ")).toBe("file");
    expect(safeFilename("\u0001")).toBe("file");
  });

  it("leaves an ordinary name alone", () => {
    expect(safeFilename("reze (2).jpg")).toBe("reze (2).jpg");
  });
});

describe("canRenderInline", () => {
  it("passes only images and PDFs", () => {
    expect(canRenderInline("image/png")).toBe(true);
    expect(canRenderInline("IMAGE/SVG+XML")).toBe(true);
    expect(canRenderInline("application/pdf")).toBe(true);
  });

  // The whole point: anything a browser would execute stays a download.
  it("refuses everything a browser could run", () => {
    for (const mime of [
      "text/html",
      "image",
      "application/xhtml+xml",
      "text/javascript",
      "application/octet-stream",
      "video/mp4",
    ]) {
      expect(canRenderInline(mime), mime).toBe(false);
    }
  });
});

describe("contentDisposition", () => {
  it("quotes an ascii name and repeats it as UTF-8", () => {
    expect(contentDisposition("attachment", "notes.pdf")).toBe(
      `attachment; filename="notes.pdf"; filename*=UTF-8''notes.pdf`,
    );
  });

  // A quote or a backslash would close the quoted-string early and let the
  // rest of the filename become header parameters of its own.
  it("cannot be escaped out of the quoted string", () => {
    const header = contentDisposition("attachment", 'a";x="b\\c/d.txt');

    expect(header.startsWith(`attachment; filename="a;x=bcd.txt"`)).toBe(true);
  });

  it("percent-encodes what RFC 5987 reserves", () => {
    expect(contentDisposition("inline", "отчёт (1).pdf")).toContain(
      "filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82%20%281%29.pdf",
    );
  });
});
