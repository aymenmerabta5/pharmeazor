export const CONFIG_ENTRYPOINTS = ["server", "next", "vite", "expo", "desktop-main"] as const;
export type ConfigEntrypoint = (typeof CONFIG_ENTRYPOINTS)[number];
export type { ServerEnv } from "./server";
export type { NextPublicEnv } from "./next";
export type { VitePublicEnv } from "./vite";
export type { ExpoPublicEnv } from "./expo";
export type { DesktopMainEnv, DesktopMainEnvOptions } from "./desktop-main";
