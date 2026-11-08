import { oc } from "@orpc/contract";
import { oz } from "@orpc/zod";
import { z } from "zod";

export const storedObjectSchema = z.object({
  id: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  originalName: z.string().min(1).max(255),
  createdAt: z.string().datetime(),
});

export const storageContract = {
  upload: oc
    .route({ method: "POST", path: "/storage/objects" })
    .input(z.object({ file: oz.file() }))
    .output(storedObjectSchema),
  uploadBase64: oc
    .route({ method: "POST", path: "/storage/objects/base64" })
    .input(
      z.object({
        base64: z
          .string()
          .min(1)
          .max(14 * 1024 * 1024)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/),
        mimeType: z.string().trim().min(1).max(128),
        originalName: z.string().trim().min(1).max(255),
      }),
    )
    .output(storedObjectSchema),
  download: oc
    .route({ method: "GET", path: "/storage/objects/{id}" })
    .input(z.object({ id: z.string().min(1).max(128) }))
    .output(oz.file()),
  downloadBase64: oc
    .route({ method: "GET", path: "/storage/objects/{id}/base64" })
    .input(z.object({ id: z.string().min(1).max(128) }))
    .output(z.object({ object: storedObjectSchema, base64: z.string() })),
  remove: oc
    .route({ method: "DELETE", path: "/storage/objects/{id}" })
    .input(z.object({ id: z.string().min(1).max(128) }))
    .output(z.object({ ok: z.literal(true) })),
};
