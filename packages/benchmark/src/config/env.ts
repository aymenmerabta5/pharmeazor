export class MissingEnvError extends Error {
  constructor(public readonly name: string) {
    super(`environment variable ${name} is not set`);
    this.name = "MissingEnvError";
  }
}

/**
 * Reads GROQ_API_KEY. The CLI is expected to be launched with
 * `bun --env-file=.env.local run --cwd packages/benchmark ...`, so this
 * function does not parse .env files itself.
 */
export function getGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new MissingEnvError("GROQ_API_KEY");
  return key;
}
