import { MCPTool } from 'mcp-framework';
import { z } from 'zod';
import { stock } from '../stock.js';

export default class Allocate extends MCPTool {
  name = 'allocate_stock';
  description =
    'Plan an order by region and available stock above safety levels. Repeated lines share capacity.';
  schema = z.object({
    region: z.enum(['UY', 'CA']).describe('Preferred shipping region'),
    lines: z
      .array(
        z.object({
          sku: z.string().min(1),
          units: z.number().int().min(1).max(1000)
        })
      )
      .min(1)
      .max(50)
      .describe('Order lines in allocation order')
  });
  async execute({ region, lines }) {
    const sites = stock.toSorted(
      (a, b) =>
        Number(b.region === region) - Number(a.region === region) ||
        a.site.localeCompare(b.site)
    );
    const remaining = new Map(),
      allocations = [],
      shortages = [];
    for (const [line, { sku, units }] of lines.entries()) {
      if (!stock.some((site) => Object.hasOwn(site.units, sku)))
        throw new Error('UNKNOWN_SKU: ' + sku);
      let needed = units;
      for (const site of sites) {
        const key = site.site + ':' + sku;
        const available =
          remaining.get(key) ??
          Math.max(0, (site.units[sku] ?? 0) - site.safety);
        const take = Math.min(available, needed);
        if (take) allocations.push({ line, sku, site: site.site, units: take });
        remaining.set(key, available - take);
        needed -= take;
        if (!needed) break;
      }
      if (needed) shortages.push({ line, sku, units: needed });
    }
    return { allocations, shortages, complete: shortages.length === 0 };
  }
}
