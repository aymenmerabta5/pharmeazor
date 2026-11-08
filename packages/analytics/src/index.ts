// Default barrel — environment-neutral analytics contracts and helpers.
// Import runtime implementations explicitly from @repo/analytics/client or
// @repo/analytics/server so client bundles can never traverse server modules.
export * from "./types";
export * from "./shared/events";
export * from "./shared/properties";
export * from "./shared/consent";
export * from "./testing/mocks";
