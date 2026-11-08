import { ORPCError } from "@orpc/server";
import { createServiceORPCError } from "../utils/service-error";
import type { OwnedStoredObject } from "@repo/services/storage";
import {
  requireStorageActor,
  type ResolveStorageService,
  type StorageTransportContext,
} from "./context";

const storageErrorCodeMap = {
  STORAGE_UNAUTHENTICATED: "UNAUTHORIZED",
  STORAGE_ACTOR_BANNED: "FORBIDDEN",
  STORAGE_FORBIDDEN: "FORBIDDEN",
  STORAGE_INVALID_FILE: "BAD_REQUEST",
  STORAGE_QUOTA_EXCEEDED: "TOO_MANY_REQUESTS",
  STORAGE_ATTACHMENT_NOT_FOUND: "NOT_FOUND",
  STORAGE_WRITE_FAILED: "INTERNAL_SERVER_ERROR",
} as const;

const MAX_CONCURRENT_UPLOADS = 2;
const MAX_CONCURRENT_UPLOADS_PER_ACTOR = 1;
const activeUploadCounts = new Map<string, number>();
let activeUploadCount = 0;

function decodeBase64(value: string): Uint8Array {
  if (value.length > 14 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new ORPCError("BAD_REQUEST", { message: "Stored object data is invalid" });
  }
  const bytes = Buffer.from(value, "base64");
  const canonicalInput = value.replace(/=+$/, "");
  if (bytes.length === 0 || bytes.toString("base64").replace(/=+$/, "") !== canonicalInput) {
    throw new ORPCError("BAD_REQUEST", { message: "Stored object data is invalid" });
  }
  return new Uint8Array(bytes);
}

function dto(value: OwnedStoredObject) {
  return {
    id: value.id,
    mimeType: value.mimeType,
    byteSize: value.byteSize,
    originalName: value.originalName,
    createdAt: value.createdAt.toISOString(),
  };
}

function acquireUploadAdmission(actorId: string): (() => void) | null {
  const actorUploadCount = activeUploadCounts.get(actorId) ?? 0;
  if (
    activeUploadCount >= MAX_CONCURRENT_UPLOADS ||
    actorUploadCount >= MAX_CONCURRENT_UPLOADS_PER_ACTOR
  ) {
    return null;
  }

  activeUploadCount += 1;
  activeUploadCounts.set(actorId, actorUploadCount + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeUploadCount -= 1;
    const currentActorCount = activeUploadCounts.get(actorId) ?? 0;
    if (currentActorCount <= 1) activeUploadCounts.delete(actorId);
    else activeUploadCounts.set(actorId, currentActorCount - 1);
  };
}

async function invokeStorage<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: storageErrorCodeMap,
      fallbackMessage: "The storage operation failed",
    });
  }
}

export function createStorageActions<TContext extends StorageTransportContext>(
  resolveService: ResolveStorageService<TContext>,
) {
  return {
    upload: async ({ context, input }: { context: TContext; input: { file: unknown } }) =>
      await invokeStorage(async () => {
        const actor = requireStorageActor(context);
        if (!(input.file instanceof File)) {
          throw new ORPCError("BAD_REQUEST", { message: "A file upload is required" });
        }
        const file = input.file;
        const releaseAdmission = acquireUploadAdmission(actor.id);
        if (!releaseAdmission) {
          throw new ORPCError("TOO_MANY_REQUESTS", {
            message: "Upload capacity is temporarily exhausted",
          });
        }
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          return dto(
            await (
              await resolveService(context)
            ).upload(actor, {
              data: bytes,
              mimeType: file.type,
              originalName: file.name,
            }),
          );
        } finally {
          releaseAdmission();
        }
      }),
    uploadBase64: async ({
      context,
      input,
    }: {
      context: TContext;
      input: { base64: string; mimeType: string; originalName: string };
    }) =>
      await invokeStorage(async () => {
        const actor = requireStorageActor(context);
        const releaseAdmission = acquireUploadAdmission(actor.id);
        if (!releaseAdmission) {
          throw new ORPCError("TOO_MANY_REQUESTS", {
            message: "Upload capacity is temporarily exhausted",
          });
        }
        try {
          return dto(
            await (
              await resolveService(context)
            ).upload(actor, {
              data: decodeBase64(input.base64),
              mimeType: input.mimeType,
              originalName: input.originalName,
            }),
          );
        } finally {
          releaseAdmission();
        }
      }),
    download: async ({ context, input }: { context: TContext; input: { id: string } }) =>
      await invokeStorage(async () => {
        const value = await (
          await resolveService(context)
        ).download(requireStorageActor(context), input.id);
        const bytes = new Uint8Array(value.data.byteLength);
        bytes.set(value.data);
        return new File([bytes], value.object.originalName, { type: value.object.mimeType });
      }),
    downloadBase64: async ({ context, input }: { context: TContext; input: { id: string } }) =>
      await invokeStorage(async () => {
        const value = await (
          await resolveService(context)
        ).download(requireStorageActor(context), input.id);
        return { object: dto(value.object), base64: Buffer.from(value.data).toString("base64") };
      }),
    remove: async ({ context, input }: { context: TContext; input: { id: string } }) =>
      await invokeStorage(
        async () =>
          await (await resolveService(context)).remove(requireStorageActor(context), input.id),
      ),
  };
}
