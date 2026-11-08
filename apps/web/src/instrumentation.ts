export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("@repo/observability");
    logger.info("[instrumentation] Next.js instrumentation registered");
  }
}
