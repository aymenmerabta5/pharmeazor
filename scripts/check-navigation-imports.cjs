#!/usr/bin/env bun
const fs = require("node:fs"),
  path = require("node:path");
const { parseOwned, jsxOpenings, jsxName, jsxAttributeString } = require("./lib/oxc.cjs");
function roots() {
  return [path.join(process.cwd(), "src"), path.join(process.cwd(), "apps", "web", "src")].filter(
    fs.existsSync,
  );
}
function list(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list(p, out);
    else if (e.isFile() && (p.endsWith(".ts") || p.endsWith(".tsx"))) out.push(p);
  }
  return out;
}
function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
function count(source, token) {
  return source.split(token).length - 1;
}
function leaves(value, prefix = "", out = []) {
  if (!value || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? prefix + "." + key : key;
    if (typeof child === "string") out.push(next);
    else leaves(child, next, out);
  }
  return out.sort();
}
function catalogDir(root) {
  const candidates = [
    path.join(root, "messages"),
    path.join(path.dirname(root), "messages"),
    path.join(root, "i18n", "messages"),
  ];
  return candidates.find((dir) =>
    ["en", "fr", "ar"].every((locale) => fs.existsSync(path.join(dir, locale + ".json"))),
  );
}
function flatten(value, prefix = "", out = {}) {
  if (!value || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? prefix + "." + key : key;
    if (typeof child === "string") out[next] = child;
    else flatten(child, next, out);
  }
  return out;
}
function placeholders(message) {
  return [...message.matchAll(/[{]([A-Za-z_][A-Za-z0-9_]*)[}]/g)].map((match) => match[1]).sort();
}
function checkCatalogs(root, violations) {
  const dir = catalogDir(root);
  if (!dir) {
    violations.push("missing en/fr/ar message catalogs under " + root);
    return;
  }
  const catalogs = Object.fromEntries(
    ["en", "fr", "ar"].map((locale) => [
      locale,
      JSON.parse(read(path.join(dir, locale + ".json"))),
    ]),
  );
  const expected = leaves(catalogs.en);
  const flat = Object.fromEntries(
    Object.entries(catalogs).map(([locale, catalog]) => [locale, flatten(catalog)]),
  );
  if (!expected.some((key) => key.startsWith("adminUsers.")))
    violations.push("English catalog is missing adminUsers keys");
  for (const locale of ["fr", "ar"]) {
    if (JSON.stringify(leaves(catalogs[locale])) !== JSON.stringify(expected))
      violations.push(locale + " catalog keys differ from English");
    for (const key of expected) {
      if (
        JSON.stringify(placeholders(flat[locale][key] || "")) !==
        JSON.stringify(placeholders(flat.en[key] || ""))
      )
        violations.push(locale + " catalog placeholders differ for " + key);
    }
  }
}
function requireText(source, token, label, violations) {
  if (!source.includes(token)) violations.push(label + " is missing " + token);
}
function readEntry(root, file, seen = new Set()) {
  const resolved = path.resolve(root, file);
  if (seen.has(resolved) || seen.size >= 8 || !resolved.startsWith(path.resolve(root) + path.sep))
    throw new Error("Invalid header re-export: " + file);
  seen.add(resolved);
  const source = read(resolved);
  const body = parseOwned(resolved, source).body.filter((node) => node.type !== "EmptyStatement");
  if (body.length !== 1 || body[0].type !== "ExportNamedDeclaration" || !body[0].source)
    return source;
  const target = body[0].source.value;
  const base = target.startsWith("@/")
    ? path.join(root, target.slice(2))
    : target.startsWith(".")
      ? path.resolve(path.dirname(resolved), target)
      : null;
  if (!base) throw new Error("Header re-export must resolve to owned source");
  const next = [base, base + ".tsx", base + ".ts"].find((candidate) => fs.existsSync(candidate));
  if (!next) throw new Error("Missing header re-export: " + target);
  return readEntry(root, path.relative(root, next), seen);
}
function headerParts(root) {
  return Object.fromEntries(
    Object.entries({
      root: "header.tsx",
      shell: "app-shell.tsx",
      actions: "header-actions.tsx",
      menu: "header-user-menu.tsx",
      navigation: "workspace-navigation.tsx",
      sidebar: "workspace-sidebar.tsx",
      trigger: "workspace-navigation-trigger.tsx",
      identity: "workspace-identity.ts",
      status: "workspace-identity-status.tsx",
    }).map(([name, file]) => [name, readEntry(root, path.join("components", file))]),
  );
}
function openings(source) {
  return jsxOpenings(parseOwned("header-part.tsx", source));
}
function requireMount(source, tag, label, violations) {
  if (openings(source).filter((opening) => jsxName(opening.name) === tag).length !== 1)
    violations.push(label + " must mount " + tag + " exactly once");
}
function checkHeader(parts, root, layout, violations) {
  const queries = read(path.join(root, "features", "app-shell", "queries.ts"));
  const controller = read(path.join(root, "features", "app-shell", "use-app-shell.ts"));
  const navigationModel = read(path.join(root, "features", "app-shell", "navigation-model.ts"));
  const header = Object.values(parts).join("\n");
  requireText(header, 'from "@/lib/translations"', "Translated header", violations);
  requireMount(layout, "AppShell", "Root layout", violations);
  requireMount(parts.shell, "Header", "AppShell", violations);
  requireMount(parts.root, "header", "Header", violations);
  const controls = [...openings(parts.root), ...openings(parts.actions)].filter(
    (opening) => jsxName(opening.name) === "LocaleSwitcher",
  );
  if (controls.length !== 1)
    violations.push("Translated header must mount LocaleSwitcher exactly once");
  for (const control of controls) {
    if ((jsxAttributeString(control, "className") || "").split(/\s+/).includes("hidden"))
      violations.push("Locale switcher must remain reachable on mobile");
  }
  const authenticated = Boolean(
    parts.actions || parts.menu || parts.navigation || parts.shell.includes("useAuth"),
  );
  if (authenticated) {
    for (const [source, tag, label] of [
      [parts.shell, "HeaderActions", "AppShell"],
      [parts.shell, "WorkspaceSidebar", "AppShell"],
      [parts.shell, "WorkspaceNavigationTrigger", "AppShell"],
      [parts.actions, "HeaderUserMenu", "Header actions"],
      [parts.sidebar, "WorkspaceNavigation", "Workspace sidebar"],
      [parts.trigger, "WorkspaceNavigation", "Workspace trigger"],
      [parts.navigation, "WorkspaceIdentityStatus", "Workspace navigation"],
      [parts.trigger, "Sheet", "Workspace trigger"],
      [parts.trigger, "SheetTrigger", "Workspace trigger"],
      [parts.trigger, "SheetContent", "Workspace trigger"],
    ])
      requireMount(source, tag, label, violations);
    for (const token of [
      "useQueryAuthSession()",
      "canonical?.hasCanonicalApi",
      "canonical.currentRequest?.user",
      "canonical?.retry",
    ])
      requireText(queries, token, "Canonical workspace identity", violations);
    for (const token of [
      'from "./queries"',
      "useShellIdentitySource()",
      "resolveWorkspaceIdentity(source)",
    ])
      requireText(controller, token, "Canonical workspace identity", violations);
    for (const token of ['from "./use-app-shell"', "useAppShell()", "identity={identity}"])
      requireText(parts.shell, token, "Canonical workspace identity", violations);
    for (const token of ['from "@/features/app-shell/navigation-model"', "WORKSPACE_NAVIGATION"])
      requireText(parts.navigation, token, "Workspace navigation model", violations);
    const identity = parts.identity.replace(/\s+/g, "");
    for (const token of [
      "if(input.pending)",
      "if(input.error)",
      "if(input.user)",
      'status:"pending"',
      'status:"error",retry:input.retry',
      'status:"authenticated",user:input.user',
      'status:"anonymous"',
    ])
      requireText(identity, token, "Workspace identity states", violations);
    if (
      identity.indexOf("if(input.pending)") > identity.indexOf("if(input.error)") ||
      identity.indexOf("if(input.error)") > identity.indexOf("if(input.user)")
    )
      violations.push("Workspace identity must settle pending and error before exposing its user");
    requireText(
      parts.navigation,
      'identity.status !== "authenticated"',
      "Private workspace navigation",
      violations,
    );
    requireText(
      parts.actions,
      'identity.status === "authenticated"',
      "Private account controls",
      violations,
    );
    for (const source of [parts.sidebar, parts.trigger])
      requireText(source, "identity={identity}", "Workspace identity handoff", violations);
    for (const token of [
      't("accountLoading")',
      't("accountUnavailable")',
      't("notSignedIn")',
      "onClick={identity.retry}",
    ])
      requireText(parts.status, token, "Workspace identity status", violations);
    requireText(
      parts.navigation,
      'useSurfaceTranslations("header")',
      "Workspace navigation",
      violations,
    );
    requireText(parts.navigation, "{t(label)}", "Workspace navigation", violations);
    requireText(parts.trigger, 't("openNavigation")', "Workspace trigger", violations);
    for (const key of ["dashboard", "settings", "signIn", "signUp", "signOut"])
      requireText(header, 't("' + key + '")', "Translated header", violations);
  }
  const labels = [...navigationModel.matchAll(/label:\s*"([A-Za-z][A-Za-z0-9]*)"/g)].map(
    (match) => match[1],
  );
  if (authenticated) {
    for (const label of ["dashboard", "settings"])
      if (!labels.includes(label)) violations.push("Workspace navigation is missing " + label);
    if (labels.includes("admin")) {
      requireText(
        parts.navigation,
        'item.label !== "admin" || isAdmin',
        "Workspace admin admission",
        violations,
      );
      requireText(
        parts.navigation,
        'identity.user.role === "admin"',
        "Workspace admin admission",
        violations,
      );
      requireText(parts.menu, 't("users")', "Translated admin menu", violations);
    }
    if (
      labels.includes("billing") &&
      !/path:\s*"\/billing"[^}]*match:\s*"exact"/.test(navigationModel)
    )
      violations.push("Billing navigation must preserve public checkout return pages");
  }
  const keys = new Set([
    ...labels,
    ...[...header.matchAll(/\bt\("([A-Za-z][A-Za-z0-9]*)"\)/g)].map((match) => match[1]),
  ]);
  const dir = catalogDir(root);
  if (dir)
    for (const locale of ["en", "fr", "ar"]) {
      const catalog = JSON.parse(read(path.join(dir, locale + ".json")));
      for (const key of keys) {
        const value = catalog.header?.[key];
        if (typeof value !== "string" || !value.trim())
          violations.push(locale + " header catalog is missing " + key);
      }
    }
}
function main() {
  const sourceRoots = roots();
  if (sourceRoots.length === 0) {
    console.log("I18n runtime check passed (no src).");
    return;
  }
  const violations = [];
  for (const root of sourceRoots) {
    const files = list(root);
    for (const file of files) parseOwned(file, read(file));
    const combined = files.map(read).join("\n");
    const nextRequest = path.join(root, "i18n", "request.ts");
    const tanstackRuntime = path.join(root, "lib", "i18n.ts");
    const hasNext = fs.existsSync(nextRequest);
    const hasTanstack = fs.existsSync(tanstackRuntime);
    if (hasNext && hasTanstack) violations.push(root + " mixes Next and TanStack i18n runtimes");
    if (hasNext) {
      const layout = read(path.join(root, "app", "layout.tsx"));
      const routing = read(path.join(root, "i18n", "routing.ts"));
      const request = read(nextRequest);
      const switcher = read(path.join(root, "components", "locale-switcher.tsx"));
      const header = headerParts(root);
      const proxy = read(path.join(root, "proxy.ts")) || read(path.join(root, "middleware.ts"));
      for (const token of ["NextIntlClientProvider", "getLocale", "getMessages", "lang=", "dir="])
        requireText(layout, token, "Next root layout", violations);
      for (const token of ["localeCookieName", "accept-language", "cookies()", "headers()"])
        requireText(request, token, "Next request config", violations);
      requireText(routing, 'localePrefix: "never"', "Next routing config", violations);
      for (const token of ["localeCookieName", "router.refresh", "<Select", "<SelectGroup>"])
        requireText(switcher, token, "Next locale switcher", violations);
      checkHeader(header, root, layout, violations);
      if (proxy.includes("next-intl/middleware") || proxy.includes("[locale]"))
        violations.push("Next proxy must keep non-prefixed routes and avoid locale middleware");
      requireText(proxy, 'new URL("/sign-in", request.url)', "Next proxy", violations);
      if (combined.includes('from "@/lib/i18n"'))
        violations.push("Next source imports the TanStack i18n runtime");
      checkCatalogs(root, violations);
    } else if (hasTanstack) {
      const providers = read(path.join(root, "components", "providers.tsx"));
      const rootRoute = read(path.join(root, "routes", "__root.tsx"));
      const runtime = read(tanstackRuntime);
      const switcher = read(path.join(root, "components", "locale-switcher.tsx"));
      const header = headerParts(root);
      requireText(providers, 'from "@/lib/i18n"', "TanStack providers", violations);
      if (count(providers, "<I18nProvider ") !== 1 || count(providers, "</I18nProvider>") !== 1)
        violations.push("TanStack AppProviders must mount I18nProvider exactly once");
      for (const token of [
        "getLocaleFromHeaders",
        "Route.useLoaderData()",
        "lang={locale} dir={localeDirection[locale]}",
        "initialLocale={locale}",
      ])
        requireText(rootRoute, token, "TanStack root locale handoff", violations);
      for (const token of [
        "document.documentElement.lang",
        "document.documentElement.dir",
        "localeCookieName",
      ])
        requireText(runtime, token, "TanStack i18n runtime", violations);
      for (const token of ["<Select", "<SelectGroup>"])
        requireText(switcher, token, "TanStack locale switcher", violations);
      checkHeader(header, root, rootRoute, violations);
      if (combined.includes("next-intl"))
        violations.push("TanStack source must never import next-intl");
      checkCatalogs(root, violations);
    } else if (combined.includes('from "next-intl') || combined.includes('from "@/lib/i18n"')) {
      violations.push(root + " leaks an i18n runtime while the capability is disabled");
    }
  }
  if (violations.length === 0) {
    console.log("I18n runtime check passed.");
    return;
  }
  console.error("I18n runtime violations:");
  for (const violation of violations) console.error("  " + violation);
  process.exit(1);
}
try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown parser failure";
  console.error(message);
  process.exit(2);
}
