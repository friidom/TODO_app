import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_FILTERS,
  attachmentCategory,
  filterCounts,
  matchesFilter,
} from "./attachmentFilter";

const file = (mime_type: string, filename: string) => ({
  mime_type,
  filename,
});

describe("attachmentCategory", () => {
  it("files images, videos and documents by mime type", () => {
    expect(attachmentCategory("image/png", "a.png")).toBe("images");
    expect(attachmentCategory("image/svg+xml", "a.svg")).toBe("images");
    expect(attachmentCategory("video/mp4", "a.mp4")).toBe("videos");
    expect(attachmentCategory("application/pdf", "a.pdf")).toBe("documents");
    expect(attachmentCategory("text/csv", "a.csv")).toBe("documents");
  });

  it("files office formats as documents, not as the binaries they are", () => {
    expect(
      attachmentCategory(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "report.docx",
      ),
    ).toBe("documents");

    expect(attachmentCategory("application/msword", "old.doc")).toBe(
      "documents",
    );
  });

  it("READS THE EXTENSION WHEN THE BROWSER OFFERED NO TYPE", () => {
    expect(attachmentCategory("application/octet-stream", "report.docx")).toBe(
      "documents",
    );
    expect(attachmentCategory("application/octet-stream", "deck.pptx")).toBe(
      "documents",
    );
    expect(attachmentCategory("application/octet-stream", "notes.md")).toBe(
      "documents",
    );
  });

  it("does not let a vnd. prefix drag everything into documents", () => {
    expect(attachmentCategory("application/vnd.rar", "a.rar")).toBe("other");
    expect(attachmentCategory("application/vnd.ms-fontobject", "a.eot")).toBe(
      "other",
    );
  });

  it("puts archives, audio and unknown binaries under other", () => {
    expect(attachmentCategory("application/zip", "a.zip")).toBe("other");
    expect(attachmentCategory("audio/mpeg", "a.mp3")).toBe("other");
    expect(attachmentCategory("application/octet-stream", "firmware.bin")).toBe(
      "other",
    );
    expect(attachmentCategory("", "")).toBe("other");
  });
});

describe("matchesFilter", () => {
  it("KEEPS EVERYTHING UNDER ALL", () => {
    const odd = [
      file("", ""),
      file("application/x-made-up", "mystery"),
      file("image/png", "a.png"),
      file("audio/wav", "a.wav"),
    ];

    for (const attachment of odd) {
      expect(matchesFilter(attachment, "all")).toBe(true);
    }
  });

  it("keeps only its own category otherwise", () => {
    const png = file("image/png", "a.png");

    expect(matchesFilter(png, "images")).toBe(true);
    expect(matchesFilter(png, "documents")).toBe(false);
    expect(matchesFilter(png, "videos")).toBe(false);
    expect(matchesFilter(png, "other")).toBe(false);
  });
});

describe("filterCounts", () => {
  it("counts each tab, with all as the total", () => {
    const counts = filterCounts([
      file("image/png", "a.png"),
      file("image/jpeg", "b.jpg"),
      file("application/pdf", "c.pdf"),
      file("video/mp4", "d.mp4"),
      file("application/zip", "e.zip"),
    ]);

    expect(counts).toEqual({
      all: 5,
      images: 2,
      documents: 1,
      videos: 1,
      other: 1,
    });
  });

  it("EVERY FILE LANDS IN EXACTLY ONE TAB", () => {
    const files = [
      file("image/png", "a.png"),
      file("video/quicktime", "b.mov"),
      file("application/pdf", "c.pdf"),
      file("application/octet-stream", "d.docx"),
      file("audio/mpeg", "e.mp3"),
      file("application/zip", "f.zip"),
      file("", "g"),
      file("text/plain", "h.txt"),
    ];

    const counts = filterCounts(files);
    const categories = ATTACHMENT_FILTERS.filter((it) => it !== "all");
    const summed = categories.reduce((total, key) => total + counts[key], 0);

    expect(summed).toBe(files.length);
    expect(counts.all).toBe(files.length);
  });

  it("returns zeroes rather than an empty object for an empty list", () => {
    expect(filterCounts([])).toEqual({
      all: 0,
      images: 0,
      documents: 0,
      videos: 0,
      other: 0,
    });
  });
});
