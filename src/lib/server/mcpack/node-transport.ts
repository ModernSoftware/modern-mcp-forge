import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import {
  ReadBuffer,
  serializeMessage,
  type JSONRPCMessage,
  type Transport
} from '@modelcontextprotocol/server';

/** MCP stdio framing from the SDK, with a shutdown budget owned by MCPack.
 * The stock client transport sends SIGTERM after 2 seconds, which terminates
 * the host immediately on Windows before longer worker cleanup can finish.
 */
export class NativeNodeTransport implements Transport {
  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;
  private child?: ChildProcessWithoutNullStreams;
  private ended: Promise<void> = Promise.resolve();
  private closing?: Promise<void>;
  private buffer = new ReadBuffer({ maxBufferSize: 10 * 1024 * 1024 });

  constructor(
    private options: {
      command: string;
      args: string[];
      cwd: string;
      env: Record<string, string>;
      shutdownMs: number;
      diagnostic: (text: string) => void;
    }
  ) {}

  async start(): Promise<void> {
    if (this.child) throw new Error('Native transport is already started.');
    const child = (this.child = spawn(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: 'pipe',
      windowsHide: true
    }));
    this.ended = new Promise((resolve) =>
      child.once('close', () => {
        this.buffer.clear();
        this.onclose?.();
        resolve();
      })
    );
    child.on('error', (error) => this.onerror?.(error));
    child.stdin.on('error', (error) => this.onerror?.(error));
    child.stderr.on('data', (chunk: Buffer) => this.options.diagnostic(chunk.toString('utf8')));
    child.stdout.on('data', (chunk: Buffer) => {
      try {
        this.buffer.append(chunk);
        let message: JSONRPCMessage | null;
        while ((message = this.buffer.readMessage()) !== null) this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(error instanceof Error ? error : new Error(String(error)));
        void this.close();
      }
    });
    await once(child, 'spawn');
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.child || this.closing) return reject(new Error('Native transport is closed.'));
      this.child.stdin.write(serializeMessage(message), (error) =>
        error ? reject(error) : resolve()
      );
    });
  }

  close(): Promise<void> {
    return (this.closing ??= (async () => {
      const child = this.child;
      if (!child) return;
      // EOF asks the CLI to run runtime.close(), including worker deadlines.
      child.stdin.end();
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, this.options.shutdownMs);
      try {
        await this.ended;
      } finally {
        clearTimeout(timer);
      }
    })());
  }
}
