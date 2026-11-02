import { MCPPrompt } from 'mcp-framework';
import { z } from 'zod';
export default class Explain extends MCPPrompt {
  name = 'explain_shortage';
  description = 'Review the unfilled portion of a planned order.';
  schema = {
    sku: { type: z.string(), description: 'Stock keeping unit', required: true }
  };
  async generateMessages({ sku }) {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            'Explain shortages for ' +
            sku +
            ' using the stock snapshot and safety levels.'
        }
      }
    ];
  }
}
