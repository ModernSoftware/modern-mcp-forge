import { z } from 'zod';

const projectPath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !/^(?:[A-Za-z]:|[\\/])/.test(value) &&
      !value.split(/[\\/]/).includes('..'),
    'Use a project-relative path without parent traversal.'
  );
const identity = { id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/) };

export const ProjectSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...identity,
      kind: z.literal('native'),
      enabled: z.boolean().default(true),
      manifest: projectPath,
      disabledCapabilities: z
        .array(
          z
            .object({
              kind: z.enum(['tools', 'resources', 'prompts']),
              name: z.string().min(1)
            })
            .strict()
        )
        .optional()
    })
    .strict(),
  // Reserved configuration only. These adapters are intentionally not executable yet.
  z
    .object({
      ...identity,
      kind: z.literal('bridge'),
      enabled: z.literal(false),
      runtime: z.enum(['node', 'python']),
      entrypoint: projectPath
    })
    .strict(),
  z
    .object({
      ...identity,
      kind: z.literal('external'),
      enabled: z.boolean().default(true),
      bearerTokenEnv: z
        .string()
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
        .optional(),
      url: z
        .string()
        .url()
        .refine((value) => {
          const url = new URL(value);
          return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
          );
        }, 'Use HTTP(S) without credentials, query or fragment.')
    })
    .strict()
]);
export const ProjectSourcesSchema = z
  .array(ProjectSourceSchema)
  .max(32)
  .superRefine((sources, ctx) => {
    const ids = new Set<string>();
    sources.forEach((source, index) => {
      if (ids.has(source.id))
        ctx.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: 'Source IDs must be unique.'
        });
      ids.add(source.id);
    });
  });
export type ProjectSource = z.infer<typeof ProjectSourceSchema>;
