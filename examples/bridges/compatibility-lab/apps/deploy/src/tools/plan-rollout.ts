import { z } from 'zod';

export const metadata = {
  name: 'plan_rollout',
  description:
    'Build parallel deployment waves or report a concrete dependency cycle.'
};
export const schema = {
  services: z
    .array(
      z.object({
        name: z.string().min(1),
        dependsOn: z.array(z.string()).max(50)
      })
    )
    .min(1)
    .max(100)
};

type Service = { name: string; dependsOn: string[] };
function error(code: string, detail: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify({ code, detail }) }]
  };
}

export default function plan({ services }: { services: Service[] }) {
  const graph = new Map(services.map((s) => [s.name, s.dependsOn]));
  if (graph.size !== services.length)
    return error('DUPLICATE_SERVICE', 'Service names must be unique');
  const wave = new Map<string, number>();
  const trail: string[] = [];
  function visit(name: string): number {
    const known = wave.get(name);
    if (known !== undefined) return known;
    const back = trail.indexOf(name);
    if (back >= 0) throw new Error(trail.slice(back).concat(name).join(' -> '));
    trail.push(name);
    const level = 1 + Math.max(0, ...graph.get(name)!.map(visit));
    trail.pop();
    wave.set(name, level);
    return level;
  }
  for (const [name, deps] of graph) {
    for (const dep of deps)
      if (!graph.has(dep))
        return error('MISSING_DEPENDENCY', name + ' -> ' + dep);
  }
  try {
    for (const name of graph.keys()) visit(name);
  } catch (cause) {
    return error('DEPENDENCY_CYCLE', (cause as Error).message);
  }
  const waves: string[][] = [];
  for (const name of [...graph.keys()].sort())
    (waves[wave.get(name)! - 1] ??= []).push(name);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ waves }) }]
  };
}
