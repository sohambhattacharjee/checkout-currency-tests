import assert from 'node:assert/strict';
import test from 'node:test';
import { createReferenceAdapter } from '../examples/reference-adapter.js';
import { currencyCases, runCurrencyCases } from '../src/contract.js';

for (const [name, run] of Object.entries(currencyCases)) {
  test(`reference adapter passes ${name}`, async () => {
    await run(createReferenceAdapter());
  });
}

test('the runner requests fresh adapter state for each fixture', async () => {
  const createdFor = [];
  await runCurrencyCases((name) => {
    createdFor.push(name);
    return createReferenceAdapter();
  });
  assert.deepEqual(createdFor, ['preserveValidQuote', 'reconcilePartialRefunds']);
});

test('the contract rejects repricing a still-valid quote at the latest rate', async () => {
  await assert.rejects(runCurrencyCases(() => {
    const reference = createReferenceAdapter();
    let originalRequest;
    return {
      ...reference,
      issueQuote(request) {
        originalRequest = request;
        reference.issueQuote(request);
      },
      placeOrder(request) {
        reference.issueQuote(originalRequest);
        reference.placeOrder(request);
      },
    };
  }), /preserveValidQuote: the persisted order should preserve/);
});

test('the contract rejects rounding each equal refund independently', async () => {
  await assert.rejects(runCurrencyCases(() => {
    const reference = createReferenceAdapter();
    return {
      ...reference,
      readRefunds(orderId) {
        return reference.readRefunds(orderId).map(refund => ({ ...refund, shopperMinor: '334' }));
      },
    };
  }), /reconcilePartialRefunds: after refund-2/);
});

test('the contract rejects recording settlement amounts as shopper refunds', async () => {
  await assert.rejects(runCurrencyCases(() => {
    const reference = createReferenceAdapter();
    return {
      ...reference,
      readRefunds(orderId) {
        return reference.readRefunds(orderId).map(refund => ({ ...refund, shopperMinor: refund.settlementMinor }));
      },
    };
  }), /reconcilePartialRefunds: after refund-1/);
});

test('the contract rejects a settlement amount calculated at the wrong rate', async () => {
  await assert.rejects(runCurrencyCases(() => {
    const reference = createReferenceAdapter();
    return {
      ...reference,
      setRate(rate) {
        if (rate.version === 'refund-v2') {
          reference.setRate({ ...rate, numerator: '11' });
          return;
        }
        reference.setRate(rate);
      },
    };
  }), /reconcilePartialRefunds: after refund-2/);
});
