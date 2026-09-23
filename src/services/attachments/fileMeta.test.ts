import { describe, expect, it } from "vitest";

import {
  downloadName,
  fileKind,
  formatBytes,
  previewKind,
} from "./fileMeta";

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
