import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { appRouter } from "./router";

// oRPC contract-first, os.prefix("/api") + oc.route.
// The constructor option is `schemaConverters` (OpenAPIGeneratorOptions in
// @orpc/openapi); `converters` is not a known property and failed to typecheck.

export async function generateOpenAPISpec(): Promise<unknown> {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  });
  return generator.generate(appRouter, {
    info: { title: "GhostInit API", version: "0.1.0" },
    // Router paths already include /api; a relative server keeps the document portable
    // without producing /api/api operation URLs.
    servers: [{ url: "/" }],
  });
}
