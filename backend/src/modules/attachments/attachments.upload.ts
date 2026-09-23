import type { RequestHandler } from "express";
import multer, { MulterError } from "multer";

import { AppError } from "../../lib/errors.js";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// memoryStorage: the buffer goes straight to MinIO, so a temp file would only
// be a second place for a failed upload to leave something behind.
const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
}).single("file");

// Multer reports its own error class, which toAppError reads as a 500 — a file
// over the limit is the client's news, not ours.
export const uploadSingleAttachment: RequestHandler = (req, res, next) => {
  single(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      next(
        new AppError(
          "bad_request",
          error.code === "LIMIT_FILE_SIZE"
            ? `File is larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`
            : "That upload could not be read.",
        ),
      );

      return;
    }

    next(error);
  });
};
