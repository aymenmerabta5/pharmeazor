import { Suspense } from "react";
import { connection } from "next/server";

async function RequestLocalizedMetadata(): Promise<null> {
  await connection();
  return null;
}

/** Request-localized metadata is an intentional dynamic part of this page. */
export function RequestLocalizedMetadataBoundary() {
  return (
    <Suspense fallback={null}>
      <RequestLocalizedMetadata />
    </Suspense>
  );
}
