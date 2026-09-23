import type { RequestHandler } from "express";
import multer, { MulterError } from "multer";

import { AppError } from "../../lib/errors.js";
import { MAX_AVATAR_BYTES } from "./users.avatar.js";

// Mirrors attachments.upload.ts, with a tighter ceiling: an avatar is a
// profile picture, not a document.
const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
}).single("file");

// Multer reports its own error class, which toAppError reads as a 500 — a file
// over the limit is the client's news, not ours.
export const uploadSingleAvatar: RequestHandler = (req, res, next) => {
  single(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      next(
        new AppError(
          "bad_request",
          error.code === "LIMIT_FILE_SIZE"
            ? `Image is larger than ${MAX_AVATAR_BYTES / 1024 / 1024} MB.`
            : "That upload could not be read.",
        ),
      );

      return;
    }

    next(error);
  });
};
