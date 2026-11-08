import "server-only";

export class AdminServiceError<TCode extends string = string> extends Error {
  readonly code: TCode;

  constructor(code: TCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "AdminServiceError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
