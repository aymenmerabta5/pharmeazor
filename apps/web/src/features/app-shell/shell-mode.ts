/**
 * App shell layout modes.
 *
 * - `workspace` keeps the global header and the optional workspace sidebar.
 * - `immersive` removes the global header so a route can own its full chrome
 *   (the chat surfaces and the pricing and plans pages render their own
 *   navigation).
 */
export type AppShellMode = "workspace" | "immersive";

const IMMERSIVE_PATHS = new Set(["/", "/agent", "/plans", "/pricing"]);

export function appShellMode(pathname: string): AppShellMode {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const [root] = normalized.split("/").slice(1);
  const matches =
    IMMERSIVE_PATHS.has(normalized) || (root !== undefined && IMMERSIVE_PATHS.has(`/${root}`));
  return matches ? "immersive" : "workspace";
}
