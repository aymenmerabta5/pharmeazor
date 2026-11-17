import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
import { ChatPage as GhostinitPageContent } from "@/features/chat/page";

/**
 * The single agent surface. The question is read on the server so the route
 * renders the conversation state immediately on a deep link instead of
 * flashing the welcome hero while a client search-param read catches up.
 */
export default async function RequestLocalizedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialQuestion = typeof params.q === "string" ? params.q : undefined;
  return (
    <>
      <RequestLocalizedMetadataBoundary />
      <GhostinitPageContent initialQuestion={initialQuestion} />
    </>
  );
}
