import { env } from "../../config/env.js";
import { minioClient } from "./minio.js";

const bucket = env.MINIO_BUCKET;

export class MinioStorage {
  // The bucket is never made public: every read goes through
  // /todos/:todoId/attachments/:id/content, which authorizes and then streams.
  // Created rather than merely probed so `docker compose up` on a fresh volume
  // has a working attachments feature rather than a console warning.
  async ensureBucket(): Promise<void> {
    if (!(await minioClient.bucketExists(bucket))) {
      await minioClient.makeBucket(bucket);
    }
  }

  async upload(
    objectName: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await minioClient.putObject(bucket, objectName, buffer, buffer.length, {
      "Content-Type": contentType,
    });
  }

  async download(objectName: string) {
    return minioClient.getObject(bucket, objectName);
  }

  async delete(objectName: string): Promise<void> {
    await minioClient.removeObject(bucket, objectName);
  }

  async exists(objectName: string): Promise<boolean> {
    try {
      await minioClient.statObject(bucket, objectName);
      return true;
    } catch {
      return false;
    }
  }
}

export const minioStorage = new MinioStorage();
