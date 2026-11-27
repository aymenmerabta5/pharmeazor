import { createHash, type Hash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { createInterface } from "node:readline";

export interface JsonlSink {
  readonly checksum: string;
  readonly count: number;
  write(value: object): Promise<void>;
  close(): Promise<void>;
}

/**
 * Streaming JSONL writer. It hashes each emitted line and never retains the
 * records in memory, so large candidate artifacts can be emitted safely.
 */
export class HashingJsonlSink implements JsonlSink {
  private readonly hash: Hash = createHash("sha256");
  private readonly handle: FileHandle | null;
  private records = 0;
  private finished = false;
  private digestValue: string | null = null;

  constructor(handle: FileHandle | null) {
    this.handle = handle;
  }

  get checksum(): string {
    if (!this.finished || !this.digestValue) {
      throw new Error("JSONL sink checksum requested before close");
    }
    return this.digestValue;
  }

  get count(): number {
    return this.records;
  }

  async write(value: object): Promise<void> {
    if (this.finished) throw new Error("Cannot write to a closed JSONL sink");
    const line = `${JSON.stringify(value)}\n`;
    this.hash.update(line, "utf8");
    await this.handle?.write(line, null, "utf8");
    this.records += 1;
  }

  async close(): Promise<void> {
    if (this.finished) return;
    this.digestValue = this.hash.digest("hex");
    this.finished = true;
    await this.handle?.close();
  }
}

export async function createJsonlSink(path: string | null): Promise<JsonlSink> {
  if (path === null) return new HashingJsonlSink(null);
  return new HashingJsonlSink(await open(path, "w"));
}

export async function* readJsonlFile<T>(path: string): AsyncGenerator<T> {
  const input = createReadStream(path, { encoding: "utf8" });
  const reader = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of reader) {
      lineNumber += 1;
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as T;
      } catch (cause) {
        throw new Error(`Invalid JSONL at ${path}:${lineNumber}`, { cause });
      }
    }
  } finally {
    reader.close();
    input.destroy();
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}
