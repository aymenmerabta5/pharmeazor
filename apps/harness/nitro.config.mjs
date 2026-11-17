import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const EVE_RESOLVER_EXTENSIONS = [
  "",
  ".mjs",
  ".js",
  ".mts",
  ".ts",
  ".json",
  ".cjs",
  ".cts",
  ".tsx",
  ".jsx",
  ".node",
  ".wasm",
];
const EVE_RESOLVER_PLUGIN_NAME = "ghostinit:eve-import-resolver";
const eveRequire = createRequire(import.meta.url);

function isEveImportFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveEveAbsoluteImport(source) {
  let path;
  if (source.startsWith("file://")) {
    try {
      path = fileURLToPath(source);
    } catch {
      return null;
    }
  } else if (isAbsolute(source) || /^[A-Za-z]:[\\/]/.test(source)) {
    path = source;
  } else {
    return null;
  }
  for (const extension of EVE_RESOLVER_EXTENSIONS) {
    const candidate = path + extension;
    if (isEveImportFile(candidate)) return candidate;
  }
  return null;
}

export default {
  preset: process.env.VERCEL ? "vercel" : "node-server",
  hooks: {
    "rollup:before"(_nitro, config) {
      // Eve's development hook preserves function externals but drops other forms.
      if (config.external && typeof config.external !== "function") {
        const external = (Array.isArray(config.external) ? config.external : [config.external]).map(
          (entry) =>
            typeof entry === "string"
              ? entry
              : new RegExp(entry.source, entry.flags.replace(/[gy]/g, "")),
        );
        config.external = (source) =>
          external.some((entry) =>
            typeof entry === "string" ? entry === source : entry.test(source),
          );
      }
      const plugins = Array.isArray(config.plugins) ? config.plugins : [];
      if (
        plugins.some(
          (plugin) =>
            typeof plugin === "object" &&
            plugin !== null &&
            Reflect.get(plugin, "name") === EVE_RESOLVER_PLUGIN_NAME,
        )
      ) {
        return;
      }
      plugins.unshift({
        name: EVE_RESOLVER_PLUGIN_NAME,
        resolveId(source) {
          const absolute = resolveEveAbsoluteImport(source);
          if (absolute) return absolute;
          if (source === "eve" || source.startsWith("eve/")) {
            try {
              return eveRequire.resolve(source);
            } catch {
              return null;
            }
          }
          return null;
        },
      });
      config.plugins = plugins;
    },
  },
};
