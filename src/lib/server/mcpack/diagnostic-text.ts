import type { Manifest } from '@modern-software/mcpack';

// Sanitize the retained stderr before shortening it for display, so a slice
// cannot expose the end of an otherwise recognizable credential.
export function diagnosticExcerpt(
  stderr: string,
  privateValues: string[] = []
) {
  const environmentSecrets = Object.entries(process.env)
    .filter(
      ([key, value]) =>
        value && /token|secret|passw|api.?key|credential/i.test(key)
    )
    .map(([, value]) => value!);
  // A full rolling buffer can start in the middle of a token or credential.
  const firstNewline = stderr.indexOf('\n');
  let text =
    stderr.length < 16384
      ? stderr
      : firstNewline < 0
        ? ''
        : stderr.slice(firstNewline + 1);
  for (const secret of [...new Set([...privateValues, ...environmentSecrets])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    text = text.replaceAll(secret, '[redacted]');
  return text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/(\b(?:bearer|basic)\s+)[^\s"',;]+/gi, '$1[redacted]')
    .replace(
      /(["']?[\w.-]*(?:token|secret|password|api[-_]?key|credential)[\w.-]*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi,
      '$1[redacted]'
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .trim()
    .slice(-4096);
}

export function missingHandlerMessage(stderr: string, manifest?: Manifest) {
  if (!manifest) return;
  const match =
    /Missing (tools|resources|prompts) handler: ([\w.-]+)/.exec(stderr) ??
    /Missing handler: \{'kind': '(tools|resources|prompts)', 'handler': '([\w.-]+)'\}/.exec(
      stderr
    );
  if (!match) return;
  const kind = match[1] as 'tools' | 'resources' | 'prompts';
  const handler = match[2];
  const workers = new Set(
    manifest[kind]
      ?.filter((item) => item.handler === handler)
      .map((item) => item.worker)
  );
  if (!workers.size) return;
  const locations = Array.from(
    workers,
    (id) =>
      `worker "${id}" (${manifest.workers[id]?.module ?? 'unknown module'})`
  );
  return `Missing ${kind} handler "${handler}". Check the export in ${locations.join(' or ')}.`;
}
