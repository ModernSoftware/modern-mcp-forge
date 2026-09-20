export class ToolProcessError extends Error {
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;

  constructor(
    message: string,
    options?: {
      exitCode?: number | null;
      stderr?: string;
      stdout?: string;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'ToolProcessError';
    this.exitCode = options?.exitCode ?? null;
    this.stderr = options?.stderr ?? '';
    this.stdout = options?.stdout ?? '';
  }
}
