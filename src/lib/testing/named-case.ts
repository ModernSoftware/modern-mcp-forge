import { z } from 'zod';

const pointer = z
  .string()
  .max(2048)
  .regex(
    /^(?:\/(?:[^~/]|~[01])*)*$/,
    'Use a JSON Pointer such as /structuredContent/total.'
  );
export const CaseDefinition = z
  .object({
    name: z.string().trim().min(1).max(120),
    source: z.string().min(1),
    sourceKind: z.enum(['native', 'bridge', 'external']),
    tool: z.string().min(1),
    arguments: z.record(z.string(), z.json()),
    expect: z.discriminatedUnion('mode', [
      z
        .object({
          mode: z.enum(['success', 'tool-error']),
          fields: z
            .array(z.object({ path: pointer, value: z.json() }).strict())
            .max(48)
        })
        .strict(),
      z.object({ mode: z.literal('invalid-input'), path: pointer }).strict()
    ])
  })
  .strict();
export const SavedCase = CaseDefinition.extend({
  id: z.uuid(),
  schemaHash: z.string().regex(/^[a-f0-9]{64}$/)
});
export type ToolCase = z.infer<typeof SavedCase>;
export function atPointer(root: unknown, path: string): unknown {
  let value = root;
  for (const token of path.split('/').slice(1)) {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    if (
      value === null ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key))
    )
      return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
