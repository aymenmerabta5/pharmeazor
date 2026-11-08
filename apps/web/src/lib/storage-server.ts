import "server-only";
import { env } from "@repo/config/server";

export interface S3Config {
  bucket: string;
  endpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicUrl?: string;
}

export function getS3Config(): S3Config | null {
  const bucket = env.STORAGE_BUCKET;
  if (env.STORAGE_DRIVER !== "s3" || bucket.startsWith("REPLACE_WITH")) return null;
  return {
    bucket,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    publicUrl: env.S3_PUBLIC_URL,
  };
}

export function isS3Configured(): boolean {
  return getS3Config() !== null;
}
