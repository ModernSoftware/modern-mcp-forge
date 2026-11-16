import { z } from 'zod';

// This local fixture uses seeded data and must not report usage to third parties.
// Set the framework's opt-out before loading it, for direct and bridged launches.
process.env.MASTRA_TELEMETRY_DISABLED = '1';
const { MCPServer } = await import('@mastra/mcp');
const { createTool } = await import('@mastra/core/tools');
const { createStep, createWorkflow } = await import('@mastra/core/workflows');

const input = z.object({
  order: z.object({
    id: z.string().min(1),
    sku: z.enum(['KIT', 'CABLE']),
    units: z.number().int().min(1).max(20)
  }),
  simulateCarrierFailure: z.boolean().default(false)
});
const outcome = z.object({
  orderId: z.string(),
  status: z.enum(['reserved', 'shipped', 'rejected', 'rolled_back']),
  code: z.string(),
  remaining: z.number().int(),
  replay: z.boolean()
});
const reservation = z.object({ request: input, outcome });
const stock = new Map([
  ['KIT', 8],
  ['CABLE', 12]
]);
const orders = new Map();

const reserve = createStep({
  id: 'reserve',
  inputSchema: input,
  outputSchema: reservation,
  execute: async ({ inputData: request }) => {
    const { id, sku, units } = request.order;
    const available = stock.get(sku);
    const previous = orders.get(id);
    let result = {
      orderId: id,
      status: 'reserved',
      code: 'RESERVED',
      remaining: available,
      replay: false
    };
    if (previous) {
      result =
        previous.sku === sku && previous.units === units
          ? { ...previous.outcome, replay: true }
          : { ...result, status: 'rejected', code: 'ORDER_ID_CONFLICT' };
    } else if (available < units) {
      result = { ...result, status: 'rejected', code: 'INSUFFICIENT_STOCK' };
    } else {
      result.remaining -= units;
      stock.set(sku, result.remaining);
      orders.set(id, { sku, units, outcome: result });
    }
    return { request, outcome: result };
  }
});

const dispatch = createStep({
  id: 'dispatch',
  inputSchema: reservation,
  outputSchema: outcome,
  execute: async ({ inputData }) => {
    const { request, outcome: result } = inputData;
    if (result.status !== 'reserved' || result.replay) return result;
    const { id, sku, units } = request.order;
    let final;
    if (request.simulateCarrierFailure) {
      stock.set(sku, stock.get(sku) + units);
      final = {
        ...result,
        status: 'rolled_back',
        code: 'CARRIER_UNAVAILABLE',
        remaining: stock.get(sku)
      };
    } else {
      final = { ...result, status: 'shipped', code: 'SHIPPED' };
    }
    orders.set(id, { sku, units, outcome: final });
    return final;
  }
});
const workflow = createWorkflow({
  id: 'fulfill-order',
  inputSchema: input,
  outputSchema: outcome
})
  .then(reserve)
  .then(dispatch)
  .commit();
// Queue overlapping attempts for one order ID so a repeat sees the committed outcome.
const pending = new Map();
async function runOrder(args) {
  const run = await workflow.createRun();
  const value = await run.start({ inputData: args });
  if (value.status !== 'success') throw new Error('WORKFLOW_FAILED');
  return value.result;
}
const fulfill = createTool({
  id: 'fulfill_order',
  description:
    'Reserve stock and dispatch an order, compensating failed shipments.',
  inputSchema: input,
  execute: async (args) => {
    const id = args.order.id;
    const prior = pending.get(id) ?? Promise.resolve();
    const current = prior.then(
      () => runOrder(args),
      () => runOrder(args)
    );
    pending.set(id, current);
    try {
      return await current;
    } finally {
      if (pending.get(id) === current) pending.delete(id);
    }
  }
});
const server = new MCPServer({
  id: 'fulfillment',
  name: 'fulfillment',
  version: '1.0.0',
  tools: { fulfill_order: fulfill }
});
await server.startStdio();
