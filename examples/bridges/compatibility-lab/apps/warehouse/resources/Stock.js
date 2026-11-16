import { MCPResource } from 'mcp-framework';
import { stock } from '../stock.js';
export default class Stock extends MCPResource {
  name = 'stock_snapshot';
  uri = 'warehouse://stock/current';
  mimeType = 'application/json';
  async read() {
    return [
      { uri: this.uri, mimeType: this.mimeType, text: JSON.stringify(stock) }
    ];
  }
}
