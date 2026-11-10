import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';

// Check repository-local Markdown destinations without depending on remote sites.
const root = process.cwd();
const files: string[] = [];
function walk(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name.startsWith('.') ||
      ['node_modules', 'build', 'dist'].includes(entry.name)
    )
      continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (extname(path) === '.md') files.push(path);
  }
}
for (const entry of readdirSync(root)) {
  if (entry.endsWith('.md')) files.push(resolve(root, entry));
}
for (const directory of ['docs', 'examples']) walk(resolve(root, directory));
const withoutFences = (text: string) =>
  text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
const anchors = new Map<string, Set<string>>();
function headings(path: string) {
  if (anchors.has(path)) return anchors.get(path)!;
  const counts = new Map<string, number>();
  const ids = new Set<string>();
  for (const match of withoutFences(readFileSync(path, 'utf8')).matchAll(
    /^#{1,6}\s+(.+?)\s*#*$/gm
  )) {
    const slug = match[1]
      .replace(/<[^>]*>/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = counts.get(slug) ?? 0;
    ids.add(count ? `${slug}-${count}` : slug);
    counts.set(slug, count + 1);
  }
  anchors.set(path, ids);
  return ids;
}
const errors: string[] = [];
let links = 0;
for (const path of files) {
  const text = withoutFences(readFileSync(path, 'utf8'));
  for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const href = match[1]
      .trim()
      .replace(/\s+["'][\s\S]*$/, '')
      .replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    links++;
    const [file, fragment] = href.split('#');
    const target = resolve(dirname(path), decodeURIComponent(file || ''));
    const destination = file ? target : path;
    if (!existsSync(destination)) {
      errors.push(`${relative(root, path)}: missing ${href}`);
    } else if (
      fragment &&
      extname(destination) === '.md' &&
      !headings(destination).has(decodeURIComponent(fragment))
    ) {
      errors.push(`${relative(root, path)}: missing anchor ${href}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${links} local links in ${files.length} Markdown files.`
  );
