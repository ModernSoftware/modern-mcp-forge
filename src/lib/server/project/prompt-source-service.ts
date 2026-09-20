import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';

import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep
} from 'node:path';

import {
  getProjectRoot,
  loadProjectManifest
} from '$lib/server/project/loader';

import type { PromptDefinition } from '$lib/server/project/schema';

const MAX_PROMPT_BYTES = 1024 * 1024;

export class PromptSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptSourceError';
  }
}

export class PromptSourceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptSourceConflictError';
  }
}

export interface PromptSourceInfo {
  promptName: string;
  declaredTemplate: string;
  resolvedPath: string;
  projectRelativePath: string | null;
  external: boolean;
  exists: boolean;
  language: 'markdown' | 'plaintext';
}

function getPrompt(promptName: string): PromptDefinition {
  const manifest = loadProjectManifest();

  const prompt = manifest.prompts.find((candidate) => candidate.name === promptName);

  if (!prompt) {
    throw new PromptSourceError(`Prompt "${promptName}" is not registered.`);
  }

  return prompt;
}

function resolveTemplatePath(prompt: PromptDefinition): string {
  return isAbsolute(prompt.template)
    ? resolve(prompt.template)
    : resolve(getProjectRoot(), prompt.template);
}

function isOutsideProject(path: string): boolean {
  const relativePath = relative(getProjectRoot(), path);

  return (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  );
}

function ensureReadableSize(path: string): void {
  if (statSync(path).size > MAX_PROMPT_BYTES) {
    throw new PromptSourceError('Prompt template exceeds the current 1 MB limit.');
  }
}

export function getPromptSourceInfo(promptName: string): PromptSourceInfo {
  const prompt = getPrompt(promptName);
  const path = resolveTemplatePath(prompt);
  const external = isOutsideProject(path);

  return {
    promptName: prompt.name,
    declaredTemplate: prompt.template,
    resolvedPath: path,
    projectRelativePath:
      external
        ? null
        : relative(getProjectRoot(), path),
    external,
    exists: existsSync(path),
    language:
      path.toLowerCase().endsWith('.md')
        ? 'markdown'
        : 'plaintext'
  };
}

export function readPromptTemplate(promptName: string): {
  info: PromptSourceInfo;
  content: string | null;
} {
  const info = getPromptSourceInfo(promptName);

  if (!info.exists) {
    return {
      info,
      content: null
    };
  }

  ensureReadableSize(info.resolvedPath);

  return {
    info,
    content: readFileSync(info.resolvedPath, 'utf8')
  };
}

export function readPromptTemplateText(prompt: PromptDefinition): string {
  const path = resolveTemplatePath(prompt);

  if (!existsSync(path)) {
    throw new PromptSourceError(`Prompt template does not exist: ${path}`);
  }

  ensureReadableSize(path);

  return readFileSync(path, 'utf8');
}

export function renderPromptTemplate(
  template: string,
  args: Record<string, string | undefined>
): string {
  return template.replace(
    /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g,
    (match, name: string) => {
      const value = args[name];

      return value === undefined
        ? match
        : value;
    }
  );
}

function starterTemplate(prompt: PromptDefinition): string {
  const argumentsList = Object.keys(prompt.arguments);
  const argumentsSection = argumentsList.length === 0
    ? ''
    : `\n\n${argumentsList.map((name) => `${name}: {{${name}}}`).join('\n')}`;

  return `# ${prompt.title ?? prompt.name}\n\n${prompt.description || 'Add prompt instructions here.'}${argumentsSection}\n`;
}

export function createStarterPromptTemplate(promptName: string): {
  info: PromptSourceInfo;
  content: string;
} {
  const prompt = getPrompt(promptName);
  const info = getPromptSourceInfo(promptName);

  if (info.exists) {
    throw new PromptSourceConflictError(`Prompt template already exists at "${info.resolvedPath}".`);
  }

  mkdirSync(dirname(info.resolvedPath), { recursive: true });

  const content = starterTemplate(prompt);

  writeFileSync(
    info.resolvedPath,
    content,
    {
      encoding: 'utf8',
      flag: 'wx'
    }
  );

  return {
    info: {
      ...info,
      exists: true
    },
    content
  };
}

export function savePromptTemplate(promptName: string, content: string): PromptSourceInfo {
  const info = getPromptSourceInfo(promptName);

  if (!info.exists) {
    throw new PromptSourceError('Prompt template does not exist. Create it first.');
  }

  const directory = dirname(info.resolvedPath);
  const tempPath = resolve(directory, `.forge-prompt-${process.pid}-${Date.now()}.tmp`);

  try {
    writeFileSync(
      tempPath,
      content,
      {
        encoding: 'utf8',
        flag: 'wx'
      }
    );

    renameSync(tempPath, info.resolvedPath);
  } finally {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }

  return {
    ...info,
    exists: true
  };
}
