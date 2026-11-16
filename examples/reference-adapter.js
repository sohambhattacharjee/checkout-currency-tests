function roundHalfUp(numerator, denominator) {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function convert(minor, rate) {
  return roundHalfUp(BigInt(minor) * BigInt(rate.numerator), BigInt(rate.denominator));
}

export function createReferenceAdapter() {
  const rates = new Map();
  const quotes = new Map();
  const orders = new Map();
  const rateFor = (from, to) => rates.get(`${from}/${to}`);

  return {
    setRate(rate) {
      rates.set(`${rate.from}/${rate.to}`, { ...rate });
    },

    issueQuote(request) {
      const rate = rateFor(request.sourceCurrency, request.shopperCurrency);
      quotes.set(request.id, {
        expiresAt: request.expiresAt,
        shopperMinor: String(convert(request.sourceMinor, rate)),
        shopperCurrency: request.shopperCurrency,
        quoteRateVersion: rate.version,
      });
    },

    placeOrder({ id, quoteId, at }) {
      const quote = quotes.get(quoteId);
      if (!quote || Date.parse(at) >= Date.parse(quote.expiresAt)) {
        throw new Error('A valid quote is required');
      }
      const { shopperMinor, shopperCurrency, quoteRateVersion } = quote;
      orders.set(id, { id, quoteId, shopperMinor, shopperCurrency, quoteRateVersion });
    },

    readOrder(id) {
      return { ...orders.get(id) };
    },

    seedPaidOrder(order) {
      orders.set(order.id, { ...order, refundedWeight: 0n, refundedMinor: 0n, refunds: [] });
    },

    refund({ id, orderId, weight }) {
      const order = orders.get(orderId);
      const nextWeight = order.refundedWeight + BigInt(weight);
      const totalWeight = BigInt(order.totalRefundWeight);
      if (nextWeight > totalWeight) {
        throw new Error('Cannot refund more than the paid amount');
      }
      const nextRefundedMinor = roundHalfUp(BigInt(order.shopperMinor) * nextWeight, totalWeight);
      const shopperMinor = nextRefundedMinor - order.refundedMinor;
      const rate = rateFor(order.shopperCurrency, order.settlementCurrency);
      order.refunds.push({
        id,
        shopperMinor: String(shopperMinor),
        shopperCurrency: order.shopperCurrency,
        settlementMinor: String(convert(shopperMinor, rate)),
        settlementCurrency: order.settlementCurrency,
        settlementRateVersion: rate.version,
      });
      order.refundedWeight = nextWeight;
      order.refundedMinor = nextRefundedMinor;
    },

    readRefunds(orderId) {
      return structuredClone(orders.get(orderId).refunds);
    },
  };
}
