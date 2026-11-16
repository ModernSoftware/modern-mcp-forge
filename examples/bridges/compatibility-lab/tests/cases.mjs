// Direct and bridged calls run in the same order against independent seeded applications.
const quote = { sku: 'ACT-42', quantity: 3, tier: 'premium' };
const delivery = {
  orderedAtLocal: '2026-10-30T16:00',
  service: 'express',
  parcels: [{ kg: 2 }]
};
const returned = {
  order_id: 'A-100',
  as_of: '2026-10-20',
  item: { units: 2, condition: 'opened' }
};
const policy = {
  region: 'UY',
  other_region: 'CA',
  basket: { subtotal_cents: 8000, days_since_delivery: 20 }
};
const order = { id: 'SHIP-1', sku: 'KIT', units: 2 };
export const scenarios = [
  [
    'native',
    'get_quote_by_sku',
    quote,
    { subtotal: '59.85', discount: '4.49', tax: '4.57', total: '59.93' }
  ],
  [
    'native',
    'get_quote_by_sku',
    { ...quote, sku: 'MISSING' },
    { code: 'SKU_NOT_FOUND' },
    true
  ],
  [
    'native',
    'get_quote_by_sku',
    { ...quote, quantity: 21 },
    { code: 'INSUFFICIENT_STOCK' },
    true
  ],
  [
    'native',
    'estimate_delivery',
    delivery,
    { dispatchDate: '2026-11-03', deliveryDate: '2026-11-04' }
  ],
  [
    'native',
    'estimate_delivery',
    { ...delivery, parcels: [{ kg: 31 }] },
    'PARCEL_OVER_LIMIT',
    true
  ],
  ['returns', 'preview_return', returned, { refund: '30.59', units: 2 }],
  [
    'returns',
    'preview_return',
    { ...returned, order_id: 'B-200' },
    'ORDER_FORBIDDEN',
    true
  ],
  [
    'returns',
    'preview_return',
    { ...returned, as_of: '2026-12-10' },
    'OUTSIDE_RETURN_WINDOW',
    true
  ],
  [
    'policy',
    'compare_policy',
    policy,
    {
      first: { returnEligible: true, freeShipping: true },
      second: { returnEligible: false, freeShipping: false }
    }
  ],
  [
    'policy',
    'compare_policy',
    { ...policy, region: 'UNKNOWN' },
    'UNKNOWN_REGION',
    true
  ],
  [
    'deploy',
    'plan_rollout',
    {
      services: [
        { name: 'web', dependsOn: ['api'] },
        { name: 'api', dependsOn: ['db'] },
        { name: 'db', dependsOn: [] },
        { name: 'queue', dependsOn: [] }
      ]
    },
    { waves: [['db', 'queue'], ['api'], ['web']] }
  ],
  [
    'deploy',
    'plan_rollout',
    {
      services: [
        { name: 'a', dependsOn: ['b'] },
        { name: 'b', dependsOn: ['a'] }
      ]
    },
    { code: 'DEPENDENCY_CYCLE', detail: 'a -> b -> a' },
    true
  ],
  [
    'warehouse',
    'allocate_stock',
    {
      region: 'UY',
      lines: [
        { sku: 'KIT', units: 10 },
        { sku: 'KIT', units: 7 }
      ]
    },
    {
      allocations: [
        { line: 0, site: 'MVD', units: 6 },
        { line: 0, site: 'SAL', units: 4 },
        { line: 1, site: 'YYZ', units: 5 }
      ],
      shortages: [{ line: 1, sku: 'KIT', units: 2 }],
      complete: false
    }
  ],
  [
    'warehouse',
    'allocate_stock',
    { region: 'UY', lines: [{ sku: 'MISSING', units: 1 }] },
    'UNKNOWN_SKU',
    true
  ],
  [
    'fulfillment',
    'fulfill_order',
    { order, simulateCarrierFailure: true },
    { code: 'CARRIER_UNAVAILABLE', remaining: 8, replay: false }
  ],
  [
    'fulfillment',
    'fulfill_order',
    { order, simulateCarrierFailure: true },
    { code: 'CARRIER_UNAVAILABLE', remaining: 8, replay: true }
  ],
  [
    'fulfillment',
    'fulfill_order',
    { order: { ...order, id: 'SHIP-2' } },
    { code: 'SHIPPED', remaining: 6, replay: false }
  ],
  [
    'fulfillment',
    'fulfill_order',
    { order: { ...order, id: 'SHIP-2' } },
    { code: 'SHIPPED', remaining: 6, replay: true }
  ],
  [
    'fulfillment',
    'fulfill_order',
    { order: { ...order, id: 'SHIP-2', units: 3 } },
    { code: 'ORDER_ID_CONFLICT', remaining: 6 }
  ],
  [
    'fulfillment',
    'fulfill_order',
    { order: { ...order, id: 'SHIP-3', units: 7 } },
    { code: 'INSUFFICIENT_STOCK', remaining: 6 }
  ]
];
