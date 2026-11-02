import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import Decimal from 'decimal.js';

const cents = (value) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const result = (value, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  structuredContent: value,
  isError
});

export function createWorker({ projectRoot, config }) {
  const seed = JSON.parse(
    readFileSync(resolve(projectRoot, config.catalog), 'utf8')
  );
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE product (sku TEXT PRIMARY KEY, price TEXT NOT NULL, available INTEGER NOT NULL)'
  );
  const insert = db.prepare('INSERT INTO product VALUES (?, ?, ?)');
  for (const p of seed.products) insert.run(p.sku, p.unitPrice, p.available);
  const lookup = db.prepare(
    'SELECT price, available FROM product WHERE sku = ?'
  );

  function quote({ sku, quantity, tier = 'standard' }) {
    const product = lookup.get(sku);
    if (!product) return result({ code: 'SKU_NOT_FOUND', sku }, true);
    if (quantity > product.available)
      return result(
        { code: 'INSUFFICIENT_STOCK', available: product.available },
        true
      );
    const subtotal = new Decimal(product.price).times(quantity);
    const discount = cents(
      subtotal.times(tier === 'premium' ? seed.premiumDiscount : 0)
    );
    const net = subtotal.minus(discount);
    const tax = cents(net.times(seed.taxRate));
    return result({
      sku,
      quantity,
      currency: seed.currency,
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      tax: tax.toFixed(2),
      total: net.plus(tax).toFixed(2)
    });
  }
  return { tools: { quote }, close: () => db.close() };
}
