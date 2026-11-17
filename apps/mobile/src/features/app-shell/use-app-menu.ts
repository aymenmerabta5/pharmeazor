import * as React from "react";
import { usePathname, useRouter, type Href } from "expo-router";
import { useTranslations } from "@/lib/i18n";
import { useHeaderIdentity } from "./queries";
import { useSignOut } from "./use-sign-out";

export interface AppMenuDestination {
  readonly href: Href;
  readonly label: string;
  readonly current: boolean;
}

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * State, destinations and navigation for the app menu.
 *
 * The menu owns disclosure, destination routing and the sign-out handoff, so
 * the composition file stays a renderer of typed actions. Public visitors get
 * the three entry points they can use; the workspace rows appear only once an
 * account exists, which keeps the signed-out menu short.
 */
export function useAppMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useHeaderIdentity();
  const { pending, signOut } = useSignOut();
  const header = useTranslations("header");
  const tabs = useTranslations("tabs");
  const [open, setOpen] = React.useState(false);
  const signedIn = Boolean(user);

  const link = (href: Href, label: string): AppMenuDestination => ({
    href,
    label,
    current: isCurrent(pathname, String(href)),
  });

  const primary = [
    link(signedIn ? "/home" : "/", tabs("home")),
    link("/assistant", tabs("assistant")),
    link("/billing", header("billing")),
  ];

  const workspace = signedIn
    ? [
        link("/dashboard", header("dashboard")),
        link("/agent", header("agent")),
        link("/wallet", tabs("wallet")),
        link("/storage", header("storage")),
        link("/pdf", header("pdf")),
      ]
    : [];

  const openMenu = React.useCallback(() => setOpen(true), []);
  const closeMenu = React.useCallback(() => setOpen(false), []);
  const go = React.useCallback(
    (href: Href) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );
  const signOutFromMenu = React.useCallback(() => {
    setOpen(false);
    void signOut();
  }, [signOut]);

  return {
    open,
    openMenu,
    closeMenu,
    go,
    signOutFromMenu,
    signOutPending: pending,
    signedIn,
    userLabel: user?.name?.trim() || user?.email || null,
    destinations: { primary, workspace },
  };
}
