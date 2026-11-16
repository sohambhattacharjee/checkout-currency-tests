import assert from 'node:assert/strict';

async function preserveValidQuote(adapter) {
  await adapter.setRate({
    version: 'quote-v1', from: 'USD', to: 'EUR', numerator: '5', denominator: '4',
  });
  const quote = {
    id: 'quote-1',
    sourceMinor: '8002',
    sourceCurrency: 'USD',
    shopperCurrency: 'EUR',
    expiresAt: '2026-01-01T12:05:00Z',
  };
  await adapter.issueQuote(quote);
  await adapter.setRate({
    version: 'quote-v2', from: 'USD', to: 'EUR', numerator: '3', denominator: '2',
  });
  await adapter.placeOrder({ id: 'order-1', quoteId: quote.id, at: '2026-01-01T12:02:00Z' });

  const order = await adapter.readOrder('order-1');
  assert.deepEqual(order, {
    id: 'order-1',
    quoteId: quote.id,
    shopperMinor: '10003',
    shopperCurrency: 'EUR',
    quoteRateVersion: 'quote-v1',
  }, 'the persisted order should preserve the approved quote amount and explain which rate produced it');
}

async function reconcilePartialRefunds(adapter) {
  const orderId = 'order-2';
  const paidMinor = '1001';
  await adapter.seedPaidOrder({
    id: orderId,
    shopperMinor: paidMinor,
    shopperCurrency: 'EUR',
    settlementCurrency: 'USD',
    paymentRateVersion: 'original-payment',
    totalRefundWeight: '3',
  });
  const expectedRefunds = [];
  let recordedRefunds;
  const cases = [
    { id: 'refund-1', rateVersion: 'refund-v1', rateNumerator: '11', shopperMinor: '334', settlementMinor: '367' },
    { id: 'refund-2', rateVersion: 'refund-v2', rateNumerator: '12', shopperMinor: '333', settlementMinor: '400' },
    { id: 'refund-3', rateVersion: 'refund-v3', rateNumerator: '13', shopperMinor: '334', settlementMinor: '434' },
  ];

  for (const step of cases) {
    await adapter.setRate({
      version: step.rateVersion, from: 'EUR', to: 'USD', numerator: step.rateNumerator, denominator: '10',
    });
    await adapter.refund({ id: step.id, orderId, weight: '1' });
    expectedRefunds.push({
      id: step.id,
      shopperMinor: step.shopperMinor,
      shopperCurrency: 'EUR',
      settlementMinor: step.settlementMinor,
      settlementCurrency: 'USD',
      settlementRateVersion: step.rateVersion,
    });
    recordedRefunds = await adapter.readRefunds(orderId);
    assert.deepEqual(recordedRefunds, expectedRefunds,
      `after ${step.id}, verify shopper allocation and settlement conversion for each recorded refund`);
  }

  const shopperRefundTotal = recordedRefunds.reduce((sum, refund) => sum + BigInt(refund.shopperMinor), 0n);
  assert.equal(shopperRefundTotal, BigInt(paidMinor), 'full allocation should refund exactly the original shopper amount');
}

export const currencyCases = Object.freeze({ preserveValidQuote, reconcilePartialRefunds });

export async function runCurrencyCases(createAdapter) {
  if (typeof createAdapter !== 'function') {
    throw new TypeError('createAdapter must be a function that returns a fresh adapter');
  }

  for (const [name, run] of Object.entries(currencyCases)) {
    try {
      await run(await createAdapter(name));
    } catch (error) {
      throw new Error(`${name}: ${error.message}`, { cause: error });
    }
  }
}
