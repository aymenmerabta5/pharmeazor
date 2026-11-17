import { redirect } from "next/navigation";

/**
 * Legacy agent URL.
 *
 * The chat and its welcome state share `/` now, so this route only exists for
 * old links and bookmarks. The question parameter is carried over so a deep
 * link still opens the conversation it was meant to open.
 */
export default async function AgentRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const params = await searchParams;
  const question = typeof params.q === "string" ? params.q : undefined;
  redirect(question ? `/?q=${encodeURIComponent(question)}` : "/");
}
