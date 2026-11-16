// Existing application API. Its normal consumers call these methods directly.
export const actions = new Map([
  [
    'quote',
    {
      help: 'Calculate a quote for a quantity.',
      parameters: {
        type: 'object',
        properties: { quantity: { type: 'integer' } },
        required: ['quantity']
      },
      run: ({ quantity }) =>
        quantity < 1
          ? { error: 'QUANTITY_MUST_BE_POSITIVE' }
          : { total: 12 * quantity }
    }
  ]
]);
export const documents = new Map([['catalog://terms', 'Quotes use USD.']]);
export const templates = new Map([['review', (sku) => 'Review ' + sku]]);
