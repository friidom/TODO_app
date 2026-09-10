import { describe, expect, it } from "vitest";

import {
  attachmentPath,
  downloadName,
  fileKind,
  formatBytes,
  previewKind,
} from "./fileMeta";

const BOARD = "11111111-1111-4111-8111-111111111111";
const TODO = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";

const prefix = `${BOARD}/${TODO}/${ID}`;

const folders = (path: string) => path.split("/").slice(0, -1);

describe("attachmentPath", () => {
  it("builds board/todo/id with the extension kept", () => {
    expect(attachmentPath(BOARD, TODO, ID, "spec.pdf")).toBe(`${prefix}.pdf`);
  });

  it("lowercases the extension", () => {
    expect(attachmentPath(BOARD, TODO, ID, "SHOT.PNG")).toBe(`${prefix}.png`);
  });

  it("A FILENAME CANNOT CHANGE WHICH BOARD THE POLICY SEES", () => {
    const hostile = [
      "../../../evil.png",
      "a/b/c.png",
      "..%2F..%2Fevil.png",
      "evil.png/../../x",
      "....//evil.png",
    ];

    for (const name of hostile) {
      const path = attachmentPath(BOARD, TODO, ID, name);

      expect(folders(path)).toEqual([BOARD, TODO]);
      expect(path.startsWith(prefix)).toBe(true);
    }
  });

  it("drops an extension that is not one", () => {
    expect(attachmentPath(BOARD, TODO, ID, "README")).toBe(prefix);
    expect(attachmentPath(BOARD, TODO, ID, ".env")).toBe(prefix);
    expect(attachmentPath(BOARD, TODO, ID, "trailing.")).toBe(prefix);
    expect(attachmentPath(BOARD, TODO, ID, "weird.p n g")).toBe(prefix);
    expect(attachmentPath(BOARD, TODO, ID, "long.abcdefghij")).toBe(prefix);
    expect(attachmentPath(BOARD, TODO, ID, "unicode.pnɡ")).toBe(prefix);
  });

  it("keeps only the last extension of a double one", () => {
    expect(attachmentPath(BOARD, TODO, ID, "archive.tar.gz")).toBe(
      `${prefix}.gz`,
    );
  });
});

describe("downloadName", () => {
  it("keeps an ordinary name unchanged, spaces included", () => {
    expect(downloadName("Q3 report (final).pdf")).toBe("Q3 report (final).pdf");
  });

  it("STRIPS WHAT WOULD END A CONTENT-DISPOSITION HEADER EARLY", () => {
    expect(downloadName('a"b.txt')).toBe("ab.txt");
    expect(downloadName("a\r\nb.txt")).toBe("ab.txt");
    expect(downloadName("a\\b/c.txt")).toBe("abc.txt");
    expect(downloadName("a\u0000b.txt")).toBe("ab.txt");
    expect(downloadName("a\u007Fb.txt")).toBe("ab.txt");
    expect(downloadName("a\tb.txt")).toBe("ab.txt");
  });

  it("falls back rather than returning an empty header value", () => {
    expect(downloadName("///")).toBe("download");
    expect(downloadName("   ")).toBe("download");
    expect(downloadName("")).toBe("download");
  });
});

describe("formatBytes", () => {
  it("uses bytes below a thousand, with no decimal", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(999)).toBe("999 B");
  });

  it("steps up a unit at each thousand", () => {
    expect(formatBytes(1000)).toBe("1.0 KB");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(1_000_000)).toBe("1.0 MB");
    expect(formatBytes(26_214_400)).toBe("26.2 MB");
    expect(formatBytes(1_000_000_000)).toBe("1.0 GB");
    expect(formatBytes(1_000_000_000_000)).toBe("1.0 TB");
  });

  it("drops the decimal once three digits are already showing", () => {
    expect(formatBytes(512_000_000)).toBe("512 MB");
  });

  it("stops at TB rather than inventing a unit", () => {
    expect(formatBytes(5_000_000_000_000_000)).toBe("5000 TB");
  });

  it("renders a dash for a size that is not one", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("fileKind", () => {
  it("reads the mime type first", () => {
    expect(fileKind("image/png", "whatever.zip")).toBe("image");
    expect(fileKind("video/mp4", "clip.bin")).toBe("video");
    expect(fileKind("audio/mpeg", "track.bin")).toBe("audio");
    expect(fileKind("application/pdf", "doc.bin")).toBe("pdf");
    expect(fileKind("text/csv", "rows.bin")).toBe("text");
    expect(fileKind("application/zip", "bundle.bin")).toBe("archive");
  });

  it("falls back to the extension when the browser recognised nothing", () => {
    expect(fileKind("application/octet-stream", "notes.md")).toBe("text");
    expect(fileKind("application/octet-stream", "bundle.zip")).toBe("archive");
    expect(fileKind("application/octet-stream", "paper.pdf")).toBe("pdf");
  });

  it("is case insensitive about the mime type", () => {
    expect(fileKind("IMAGE/PNG", "x")).toBe("image");
  });

  it("gives up as a plain file rather than guessing", () => {
    expect(fileKind("application/octet-stream", "firmware.bin")).toBe("file");
    expect(fileKind("", "")).toBe("file");
  });
});

describe("previewKind", () => {
  it("previews images", () => {
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("image/jpeg")).toBe("image");
    expect(previewKind("image/webp")).toBe("image");
    expect(previewKind("image/gif")).toBe("image");
    expect(previewKind("IMAGE/PNG")).toBe("image");
  });

  it("previews pdfs", () => {
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("APPLICATION/PDF")).toBe("pdf");
  });

  it("GIVES NO INLINE URL TO ANYTHING ELSE", () => {
    const dangerous = [
      "text/html",
      "application/xhtml+xml",
      "text/xml",
      "image", // a prefix, not a type — must not match `image/`
      "application/pdf.evil",
      "application/octet-stream",
      "text/plain",
      "video/mp4",
      "",
    ];

    for (const mime of dangerous) {
      expect(previewKind(mime)).toBe("none");
    }
  });

  it("keeps svg on the image path, which is the img-tag path", () => {
    expect(previewKind("image/svg+xml")).toBe("image");
  });
});
