import { connection, NextResponse } from "next/server";
import { generateOpenAPISpec } from "@repo/api/openapi";
export async function GET(): Promise<NextResponse> {
  // Keep development-only schema generation out of build-time prerendering.
  await connection();
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });
  if (process.env.ENABLE_OPENAPI === "false") return new NextResponse("Not found", { status: 404 });
  const spec = await generateOpenAPISpec();
  return NextResponse.json(spec);
}
