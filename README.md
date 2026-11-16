# Checkout Currency Tests

Executable fixtures for two decisions that cross a checkout’s pricing, order, and payment records. Use them to check what a commerce integration actually persisted after an exchange rate changed.

## Run the reference suite

Use Node.js 20 or newer. The suite uses built-in modules and runs offline.

```sh
node --test
```

| Fixture | Policy under test | Expected records |
| --- | --- | --- |
| `preserveValidQuote` | Preserve an approved quote while it remains valid. Round conversion to the closest minor unit, with ties rounded up. | An 80.02 USD source amount quoted at 1.25 remains 100.03 EUR on the order after the rate updates to 1.50. The order records the original rate version. |
| `reconcilePartialRefunds` | Allocate customer refunds by rounding the cumulative share of the original payment, then applying the difference from refunds already issued. Convert each refund to settlement currency at its own fixture rate. | An original payment of 10.01 EUR is refunded as 3.34, 3.33, and 3.34 EUR. The separate USD settlement entries are 3.67, 4.00, and 4.34, each with its corresponding rate version. |

The reference adapter uses exact integer arithmetic. The tests also run against deliberately incorrect adapters and check that the fixtures flag each regression.

## Use the fixtures in another project

Implement an adapter for a disposable test environment and call the exported runner. Each method can return synchronously or asynchronously. The adapter should read persisted records for assertions and translate external identifiers, field names, and currency formats to the contract.

```js
import test from 'node:test';
import { runCurrencyCases } from './src/contract.js';
import { createCheckoutAdapter } from './checkout-adapter.js';

test('checkout currency contracts', async () => {
  await runCurrencyCases(createCheckoutAdapter);
});
```

The runner passes each fixture name to the factory and expects a fresh adapter with isolated state. Use `currencyCases` to register individual fixtures when only one applies or when test setup needs its own cleanup. [The fixture definitions](src/contract.js) specify the inputs and exact normalized assertions. [The reference adapter](examples/reference-adapter.js) illustrates the interface.

| Adapter method | Expected behavior |
| --- | --- |
| `setRate(rate)` | Make the supplied rate version current for the currency pair. The numerator and denominator express target minor units per source minor unit. |
| `issueQuote(request)` | Create an expiring quote at the current rate with the specified ID. |
| `placeOrder(request)` | Create an order from that quote at the supplied timestamp. |
| `readOrder(id)` | Read the order ID, quote ID, shopper amount and currency, and quote rate version. |
| `seedPaidOrder(order)` | Create a captured order with the supplied original amount, currencies, and refund weights. |
| `refund(request)` | Issue the requested share of the original payment under the fixture policy. |
| `readRefunds(orderId)` | Read persisted refunds in issuance order, with separate shopper and settlement fields and the settlement rate version. |

Amounts, rate components, and weights use decimal strings so adapters can represent integers without floating-point loss. The synthetic fixtures use USD and EUR, both with two decimal places. Quote locking, half-up rounding, and settlement at the refund-time rate are the declared fixture policies. Merchants and processors can use different settlement policies. Expired quotes, fees, provider differences, and currencies with different minor-unit scales need additional fixtures. [Stripe FX quotes](https://docs.stripe.com/payments/currencies/localize-prices/fx-quotes-api) · [Shopify refund conversion](https://help.shopify.com/en/manual/international/pricing/refunds)

## Upstream pilot

Medusa’s historical refund-rounding fix and its follow-up report give a concrete starting point for asking whether maintainers would reuse one fixture across multiple refund workflows. Those records concern rounding tolerance and sub-cent values. This project tests cumulative refund allocation and settlement traceability under a synthetic policy. The first milestone is to map the smallest relevant assertion to a real Medusa workflow and verify what its existing tests already cover. The reference suite currently runs against its in-memory adapter. [Medusa rounding fix](https://github.com/medusajs/medusa/pull/15303) · [Medusa follow-up report](https://github.com/medusajs/medusa/issues/15315)
