import { createEnv } from "@t3-oss/env-core";

type ViteImportMeta = ImportMeta & {
  readonly env: {
    readonly DEV?: boolean;
  };
};

const viteEnv = (import.meta as ViteImportMeta).env;

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {},
  runtimeEnv: {},
});

export const isDevelopment = viteEnv.DEV === true;
export type VitePublicEnv = typeof env;
