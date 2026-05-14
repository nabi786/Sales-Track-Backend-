const mongoose = require('mongoose');
const ProductSalesPrice = require('../models/ProductSalesPrice');
const ProductBuyPrice = require('../models/ProductBuyPrice');

/**
 * Get latest sale_price and buy_price for given product IDs (from price history models).
 * Returns { salePrices: Map<productIdString, price>, buyPrices: Map<productIdString, price> }
 */
const getLatestPricesForProducts = async (productIds) => {
  if (!productIds || productIds.length === 0) {
    return { salePrices: new Map(), buyPrices: new Map() };
  }
  const ids = productIds
    .filter(id => id && mongoose.Types.ObjectId.isValid(id))
    .map(id => (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id));

  if (ids.length === 0) {
    return { salePrices: new Map(), buyPrices: new Map() };
  }

  const [saleRows, buyRows] = await Promise.all([
    ProductSalesPrice.aggregate([
      { $match: { product_id: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$product_id', price: { $first: '$price' } } }
    ]),
    ProductBuyPrice.aggregate([
      { $match: { product_id: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$product_id', price: { $first: '$price' } } }
    ])
  ]);

  const salePrices = new Map(saleRows.map(r => [r._id.toString(), r.price]));
  const buyPrices = new Map(buyRows.map(r => [r._id.toString(), r.price]));
  return { salePrices, buyPrices };
};

/**
 * Key for (product, order time) historical lookup.
 */
function historicalPriceKey(productId, asOfDate) {
  const id = typeof productId === 'string' ? productId : productId.toString();
  return `${id}|${new Date(asOfDate).getTime()}`;
}

/**
 * For each unique { productId, asOf }, get sale/buy price from history rows with createdAt <= asOf (newest first).
 * Returns Map<historicalPriceKey, { sale: number, buy: number }>
 */
const getHistoricalPricesAtOrBefore = async (pairs) => {
  const map = new Map();
  if (!pairs || pairs.length === 0) return map;

  const seen = new Set();
  const unique = [];
  for (const { productId, asOf } of pairs) {
    if (!productId || !asOf) continue;
    const k = historicalPriceKey(productId, asOf);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push({ productId, asOf: new Date(asOf), key: k });
  }

  await Promise.all(
    unique.map(async ({ productId, asOf, key }) => {
      const pid = mongoose.Types.ObjectId.isValid(productId)
        ? typeof productId === 'string'
          ? new mongoose.Types.ObjectId(productId)
          : productId
        : null;
      if (!pid) return;

      const [saleDoc, buyDoc] = await Promise.all([
        ProductSalesPrice.findOne({ product_id: pid, createdAt: { $lte: asOf } })
          .sort({ createdAt: -1 })
          .select('price')
          .lean(),
        ProductBuyPrice.findOne({ product_id: pid, createdAt: { $lte: asOf } })
          .sort({ createdAt: -1 })
          .select('price')
          .lean()
      ]);

      map.set(key, {
        sale: saleDoc != null ? saleDoc.price : null,
        buy: buyDoc != null ? buyDoc.price : null
      });
    })
  );

  return map;
};

module.exports = { getLatestPricesForProducts, getHistoricalPricesAtOrBefore, historicalPriceKey };
