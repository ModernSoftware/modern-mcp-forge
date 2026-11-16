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
export const sourceId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
export const ExposureRuleSchema = z
  .object({
    kind: z.enum(['tools', 'resources', 'prompts']),
    identity: z.string().min(1).max(8192),
    hidden: z.boolean().optional(),
    alias: z
      .string()
      .regex(
        /^[A-Za-z0-9_.-]{1,64}$/,
        'Aliases use 1–64 letters, numbers, dots, hyphens or underscores.'
      )
      .optional(),
    description: z.string().max(16000).optional()
  })
  .strict();
export type ExposureRule = z.infer<typeof ExposureRuleSchema>;
const exposure = z
  .array(ExposureRuleSchema)
  .max(6000)
  .refine(
    (rules) =>
      new Set(rules.map((r) => JSON.stringify([r.kind, r.identity]))).size ===
      rules.length,
    'Duplicate exposure rule for an upstream capability.'
  )
  .optional();
const identity = { id: sourceId };

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
  z
    .object({
      ...identity,
      kind: z.literal('bridge'),
      exposure,
      enabled: z.boolean().default(false),
      runtime: z.enum(['node', 'python']),
      entrypoint: projectPath,
      mode: z.enum(['adapter', 'stdio']).optional(),
      checkoutEnv: z
        .string()
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
        .optional(),
      cwd: projectPath.optional(),
      args: z.array(z.string().max(2048)).max(32).optional(),
      inheritEnv: z
        .array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/))
        .max(64)
        .optional(),
      naming: z.enum(['always', 'collisions']).optional()
    })
    .strict()
    .refine((source) => !source.checkoutEnv || source.mode === 'adapter', {
      path: ['checkoutEnv'],
      message: 'Checkout variables apply only to adapter modules.'
    }),
  z
    .object({
      ...identity,
      kind: z.literal('external'),
      exposure,
      naming: z.enum(['always', 'collisions']).optional(),
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
