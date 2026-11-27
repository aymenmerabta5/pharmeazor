import { oc } from "@orpc/contract";
import { oz } from "@orpc/zod";
import { z } from "zod";
import { z as z3 } from "zod/v3";

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
    // @orpc/zod's file() is a Zod v3 schema; Zod 4 rejects it as a nested
    // element, so this input uses the matching v3 object builder.
    .input(z3.object({ file: oz.file() }))
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
