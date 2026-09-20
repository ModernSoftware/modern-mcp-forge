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

import type { ResourceDefinition } from '$lib/server/project/schema';

const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;

export class ResourceSourceError
  extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      'ResourceSourceError';
  }
}

export class ResourceSourceConflictError
  extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      'ResourceSourceConflictError';
  }
}

export interface ResourceSourceInfo {
  resourceName: string;
  declaredSource: string;
  resolvedPath: string;
  projectRelativePath:
    | string
    | null;
  language: string;
  external: boolean;
  exists: boolean;
}

function getResource(resourceName: string): ResourceDefinition {
  const manifest = loadProjectManifest();

  const resource =
    manifest.resources.find((candidate) => candidate.name === resourceName);

  if (!resource) {
    throw new ResourceSourceError(`Resource "${resourceName}" is not registered.`);
  }

  return resource;
}

function resolveSourcePath(resource: ResourceDefinition): string {
  return isAbsolute(resource.source)
    ? resolve(resource.source)
    : resolve(getProjectRoot(), resource.source);
}

function isOutsideProject(path: string): boolean {
  const projectRoot = getProjectRoot();

  const relativePath = relative(projectRoot, path);

  return (
    relativePath === '..' ||
    relativePath.startsWith(
      `..${sep}`
    ) ||
    isAbsolute(relativePath)
  );
}

function languageForResource(resource: ResourceDefinition): string {
  switch (resource.mimeType) {
    case 'text/markdown':
      return 'markdown';

    case 'application/json':
      return 'json';

    default:
      return 'plaintext';
  }
}

function ensureReadableSize(path: string): void {
  const size = statSync(path).size;

  if (size > MAX_RESOURCE_BYTES) {
    throw new ResourceSourceError(`Resource exceeds the current ${MAX_RESOURCE_BYTES / 1024 / 1024} MB text-resource limit.`);
  }
}

export function getResourceSourceInfo(resourceName: string): ResourceSourceInfo {
  const resource = getResource(resourceName);

  const path = resolveSourcePath(resource);

  const external = isOutsideProject(path);

  return {
    resourceName: resource.name,
    declaredSource: resource.source,
    resolvedPath: path,
    projectRelativePath:
      external
        ? null
        : relative(getProjectRoot(), path ),
    language: languageForResource(resource),
    external,
    exists: existsSync(path)
  };
}

export function readResourceSource(resourceName: string): {
  info: ResourceSourceInfo;
  content: string | null;
} {
  const info = getResourceSourceInfo(resourceName);

  if (!info.exists) {
    return {
      info,
      content: null
    };
  }

  ensureReadableSize(info.resolvedPath);

  return {
    info,
    content:
      readFileSync(
        info.resolvedPath,
        'utf8'
      )
  };
}

export function readResourceText(resource: ResourceDefinition): string {
  const path = resolveSourcePath(resource);

  if (!existsSync(path)) {
    throw new ResourceSourceError(`Resource source does not exist: ${path}`);
  }

  ensureReadableSize(path);

  return readFileSync(path, 'utf8');
}

function starterContent(resource: ResourceDefinition): string {
  switch (resource.mimeType) {
    case 'text/markdown':
      return `# ${resource.title ?? resource.name}

${resource.description || 'Add resource content here.'}
`;

    case 'application/json':
      return `{
        "resource": "${resource.name}",
        "description": ${JSON.stringify(resource.description || 'Add resource content here.')}
      }`;

    default:
      return `${resource.title ?? resource.name}
${resource.description || 'Add resource content here.'}
`;
  }
}

export function createStarterResourceSource(resourceName: string): {
  info: ResourceSourceInfo;
  content: string;
} {
  const resource = getResource(resourceName);

  const info = getResourceSourceInfo(resourceName);

  if (info.exists) {
    throw new ResourceSourceConflictError(`Resource source already exists at "${info.resolvedPath}".`);
  }

  mkdirSync(dirname(info.resolvedPath), { recursive: true });

  const content = starterContent(resource);

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

export function saveResourceSource(resourceName: string, content: string): ResourceSourceInfo {
  const info = getResourceSourceInfo(resourceName);

  if (!info.exists) {
    throw new ResourceSourceError('Resource source does not exist. Create it first.');
  }

  const directory = dirname(info.resolvedPath);

  const tempPath = resolve(directory, `.forge-resource-${process.pid}-${Date.now()}.tmp`);

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
