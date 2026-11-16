import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ignored = new Set([
  'node_modules',
  '.git',
  '.venv',
  'venv',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache'
]);
const sourceFile =
  /\.(?:[cm]?[jt]sx?|pyw?)$|^(?:package(?:-lock)?\.json|pyproject\.toml|requirements.*\.txt|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|uv\.lock)$/i;
function inaccessible(error: unknown) {
  return ['EACCES', 'EPERM', 'ENOENT'].includes(
    (error as NodeJS.ErrnoException).code ?? ''
  );
}

// Native workers retain their module graph until restarted. Content fingerprints let the
// local tester detect IDE edits without rereading unchanged files or resetting a
// stateful worker on every call. Installed packages are reloaded explicitly.
export async function nativeFileStamp(
  manifest: string,
  cache: Map<string, { metadata: string; digest: string }>
) {
  const seen = new Set<string>();
  const hash = createHash('sha256');
  async function visit(folder: string) {
    const entries = await readdir(folder, { withFileTypes: true }).catch(
      (error) => {
        if (inaccessible(error)) return [];
        throw error;
      }
    );
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (entry.isDirectory() && !ignored.has(entry.name)) await visit(path);
      if (
        !entry.isFile() ||
        (path !== manifest && !sourceFile.test(entry.name))
      )
        continue;
      const info = await stat(path, { bigint: true }).catch((error) => {
        if (inaccessible(error)) return null;
        throw error;
      });
      if (!info) continue;
      seen.add(path);
      const metadata = [info.ino, info.size, info.mtimeNs, info.ctimeNs].join(
        '/'
      );
      let cached = cache.get(path);
      if (cached?.metadata !== metadata) {
        const content = createHash('sha256');
        for await (const chunk of createReadStream(path)) content.update(chunk);
        cached = { metadata, digest: content.digest('hex') };
        cache.set(path, cached);
      }
      hash.update(JSON.stringify([path, cached.digest]));
    }
  }
  await visit(dirname(manifest));
  for (const path of cache.keys()) if (!seen.has(path)) cache.delete(path);
  return hash.digest('hex');
}
