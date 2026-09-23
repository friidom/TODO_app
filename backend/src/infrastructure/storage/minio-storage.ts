import { env } from "../../config/env.js";
import { minioClient } from "./minio.js";

export class MinioStorage {
  // The bucket is a constructor argument rather than a module constant so that
  // avatars get their own bucket through this same class and this same client.
  // A second storage module would have been a second place for the upload,
  // delete and exists conventions to drift.
  constructor(private readonly bucket: string) {}

  // Neither bucket is ever made public: attachments are read through
  // /todos/:todoId/attachments/:id/content, which authorizes and then streams,
  // and avatars through /users/:userId/avatar/:object, which streams an
  // unguessable server-minted key. Created rather than merely probed so
  // `docker compose up` on a fresh volume has both features working rather
  // than a console warning.
  async ensureBucket(): Promise<void> {
    if (!(await minioClient.bucketExists(this.bucket))) {
      await minioClient.makeBucket(this.bucket);
    }
  }

  async upload(
    objectName: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await minioClient.putObject(this.bucket, objectName, buffer, buffer.length, {
      "Content-Type": contentType,
    });
  }

  async download(objectName: string) {
    return minioClient.getObject(this.bucket, objectName);
  }

  async delete(objectName: string): Promise<void> {
    await minioClient.removeObject(this.bucket, objectName);
  }

  async exists(objectName: string): Promise<boolean> {
    try {
      await minioClient.statObject(this.bucket, objectName);
      return true;
    } catch {
      return false;
    }
  }
}

export const minioStorage = new MinioStorage(env.MINIO_BUCKET);

// Deliberately NOT todo-attachments: an avatar is served to anyone holding its
// url, and an attachment is not. Separate buckets keep that difference a
// property of the storage rather than of the code that reads it.
export const avatarStorage = new MinioStorage(env.MINIO_AVATAR_BUCKET);
