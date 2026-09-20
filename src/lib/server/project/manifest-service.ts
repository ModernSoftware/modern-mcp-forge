import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { getProjectManifestPath } from '$lib/server/project/loader';
import {
  ForgeProjectManifestSchema,
  PromptDefinitionSchema,
  ResourceDefinitionSchema,
  ToolDefinitionSchema,
  type ForgeProjectManifest,
  type PromptDefinition,
  type ResourceDefinition,
  type ToolDefinition
} from '$lib/server/project/schema';

export class ManifestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestConflictError';
  }
}

export class ManifestAuthoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestAuthoringError';
  }
}

export class ManifestDefinitionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestDefinitionNotFoundError';
  }
}

export type DefinitionKind = 'tool' | 'resource' | 'prompt';
type Definition = ToolDefinition | ResourceDefinition | PromptDefinition;

let writeQueue: Promise<void> = Promise.resolve();

function loadManifestFresh(): ForgeProjectManifest {
  const path = getProjectManifestPath();
  return ForgeProjectManifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

function writeManifestAtomic(manifest: ForgeProjectManifest): void {
  const manifestPath = getProjectManifestPath();
  const directory = dirname(manifestPath);
  const fileName = basename(manifestPath);
  const tempPath = join(directory, `.${fileName}.${process.pid}.${Date.now()}.tmp`);

  try {
    writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });

    ForgeProjectManifestSchema.parse(JSON.parse(readFileSync(tempPath, 'utf8')));
    renameSync(tempPath, manifestPath);
  } finally {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }
}

async function withManifestWriteLock<T>(operation: () => T): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;

  writeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return operation();
  } finally {
    release();
  }
}

function validateName(kind: string, name: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new ManifestAuthoringError(
      `${kind} names may contain only letters, numbers, underscores, and hyphens.`
    );
  }
}

function validateTool(input: unknown): ToolDefinition {
  const parsed = ToolDefinitionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ManifestAuthoringError(parsed.error.message);
  }

  if (parsed.data.runtime === 'dotnet') {
    throw new ManifestAuthoringError(
      '.NET tool authoring is not implemented in this release.'
    );
  }

  validateName('Tool', parsed.data.name);
  return parsed.data;
}

function validateResource(input: unknown): ResourceDefinition {
  const parsed = ResourceDefinitionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ManifestAuthoringError(parsed.error.message);
  }

  validateName('Resource', parsed.data.name);

  try {
    new URL(parsed.data.uri);
  } catch {
    throw new ManifestAuthoringError('Resource URI must be a valid absolute URI.');
  }

  return parsed.data;
}

function validatePrompt(input: unknown): PromptDefinition {
  const parsed = PromptDefinitionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ManifestAuthoringError(parsed.error.message);
  }

  validateName('Prompt', parsed.data.name);

  for (const argumentName of Object.keys(parsed.data.arguments)) {
    validateName('Prompt argument', argumentName);
  }

  return parsed.data;
}

function validateDefinition(kind: DefinitionKind, input: unknown): Definition {
  switch (kind) {
    case 'tool':
      return validateTool(input);
    case 'resource':
      return validateResource(input);
    case 'prompt':
      return validatePrompt(input);
  }
}

function getDefinitions(
  manifest: ForgeProjectManifest,
  kind: DefinitionKind
): Definition[] {
  switch (kind) {
    case 'tool':
      return manifest.tools;
    case 'resource':
      return manifest.resources;
    case 'prompt':
      return manifest.prompts;
  }
}

function replaceDefinitions(
  manifest: ForgeProjectManifest,
  kind: DefinitionKind,
  definitions: Definition[]
): ForgeProjectManifest {
  switch (kind) {
    case 'tool':
      return ForgeProjectManifestSchema.parse({ ...manifest, tools: definitions });
    case 'resource':
      return ForgeProjectManifestSchema.parse({ ...manifest, resources: definitions });
    case 'prompt':
      return ForgeProjectManifestSchema.parse({ ...manifest, prompts: definitions });
  }
}

export async function addToolToManifest(input: unknown): Promise<ToolDefinition> {
  const tool = validateTool(input);

  return withManifestWriteLock(() => {
    const manifest = loadManifestFresh();

    if (manifest.tools.some((item) => item.name === tool.name)) {
      throw new ManifestConflictError(
        `A tool named "${tool.name}" already exists in this project.`
      );
    }

    const next = ForgeProjectManifestSchema.parse({
      ...manifest,
      tools: [...manifest.tools, tool]
    });

    writeManifestAtomic(next);
    return tool;
  });
}

export async function addResourceToManifest(input: unknown): Promise<ResourceDefinition> {
  const resource = validateResource(input);

  return withManifestWriteLock(() => {
    const manifest = loadManifestFresh();

    if (manifest.resources.some((item) => item.name === resource.name)) {
      throw new ManifestConflictError(
        `A resource named "${resource.name}" already exists in this project.`
      );
    }

    if (manifest.resources.some((item) => item.uri === resource.uri)) {
      throw new ManifestConflictError(
        `A resource with URI "${resource.uri}" already exists in this project.`
      );
    }

    const next = ForgeProjectManifestSchema.parse({
      ...manifest,
      resources: [...manifest.resources, resource]
    });

    writeManifestAtomic(next);
    return resource;
  });
}

export async function addPromptToManifest(input: unknown): Promise<PromptDefinition> {
  const prompt = validatePrompt(input);

  return withManifestWriteLock(() => {
    const manifest = loadManifestFresh();

    if (manifest.prompts.some((item) => item.name === prompt.name)) {
      throw new ManifestConflictError(
        `A prompt named "${prompt.name}" already exists in this project.`
      );
    }

    const next = ForgeProjectManifestSchema.parse({
      ...manifest,
      prompts: [...manifest.prompts, prompt]
    });

    writeManifestAtomic(next);
    return prompt;
  });
}

export async function updateDefinitionInManifest(
  kind: DefinitionKind,
  currentName: string,
  input: unknown
): Promise<Definition> {
  const definition = validateDefinition(kind, input);

  if (definition.name !== currentName) {
    throw new ManifestAuthoringError(
      `Renaming ${kind}s is not supported in-place yet. Keep "name" as "${currentName}", or delete and recreate the definition.`
    );
  }

  return withManifestWriteLock(() => {
    const manifest = loadManifestFresh();
    const definitions = getDefinitions(manifest, kind);
    const index = definitions.findIndex((item) => item.name === currentName);

    if (index < 0) {
      throw new ManifestDefinitionNotFoundError(`${kind} "${currentName}" was not found.`);
    }

    if (kind === 'tool') {
      const currentTool = definitions[index] as ToolDefinition;
      const updatedTool = definition as ToolDefinition;

      if (currentTool.runtime !== updatedTool.runtime) {
        throw new ManifestAuthoringError(
          `Changing runtime for tool "${currentName}" is not supported in-place. Delete and recreate the tool instead.`
        );
      }
    }

    if (kind === 'resource') {
      const resource = definition as ResourceDefinition;
      const duplicateUri = manifest.resources.some(
        (item, candidateIndex) => candidateIndex !== index && item.uri === resource.uri
      );

      if (duplicateUri) {
        throw new ManifestConflictError(
          `Another resource already uses URI "${resource.uri}".`
        );
      }
    }

    const nextDefinitions = definitions.map((item, candidateIndex) =>
      candidateIndex === index ? definition : item
    );

    const next = replaceDefinitions(manifest, kind, nextDefinitions);
    writeManifestAtomic(next);

    return definition;
  });
}

export async function setDefinitionEnabled(
  kind: DefinitionKind,
  name: string,
  enabled: boolean
): Promise<Definition> {
  return withManifestWriteLock(() => {
    const manifest = loadManifestFresh();
    const definitions = getDefinitions(manifest, kind);
    const index = definitions.findIndex((item) => item.name === name);

    if (index < 0) {
      throw new ManifestDefinitionNotFoundError(`${kind} "${name}" was not found.`);
    }

    const nextDefinitions = definitions.map((item, candidateIndex) =>
      candidateIndex === index ? { ...item, enabled } : item
    );

    const next = replaceDefinitions(manifest, kind, nextDefinitions);
    writeManifestAtomic(next);

    return nextDefinitions[index];
  });
}

export async function deleteDefinitionFromManifest(
  kind: DefinitionKind,
  name: string
): Promise<void> {
  await withManifestWriteLock(() => {
    const manifest = loadManifestFresh();
    const definitions = getDefinitions(manifest, kind);
    const index = definitions.findIndex((item) => item.name === name);

    if (index < 0) {
      throw new ManifestDefinitionNotFoundError(`${kind} "${name}" was not found.`);
    }

    const nextDefinitions = definitions.filter((_, candidateIndex) => candidateIndex !== index);
    const next = replaceDefinitions(manifest, kind, nextDefinitions);

    writeManifestAtomic(next);
  });
}
