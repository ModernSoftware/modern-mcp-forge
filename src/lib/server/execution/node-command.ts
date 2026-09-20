export interface ResolvedNodeCommand {
  executable: string;
  prefixArgs: string[];
}

export function resolveNodeCommand(): ResolvedNodeCommand {
  const node = Bun.which('node');

  if (node) {
    return {
      executable: node,
      prefixArgs: []
    };
  }

  throw new Error('Node.js runtime not found. Install Node.js and ensure "node" is available on PATH.');
}
