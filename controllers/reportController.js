const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const { getDateRange, getCustomDateRange } = require('../utils/dateRanges');
const {
  getLatestPricesForProducts,
  getHistoricalPricesAtOrBefore,
  historicalPriceKey
} = require('../utils/productPrices');

const VALID_PERIODS = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year'];

/**
 * GET /api/customer/reports/sales
 * Query params: either (period=today|yesterday|this_week|last_week|this_month|last_month|this_year) OR (start_date=YYYY-MM-DD&end_date=YYYY-MM-DD)
 * Dates are interpreted in Pakistan timezone (Asia/Karachi).
 * Only includes active orders (order_status === 0).
 */
const getSalesReport = async (req, res) => {
  try {
    const { period, start_date, end_date } = req.query;

    let range;
    let rangeLabel;

    if (start_date && end_date) {
      // Custom date range (Pakistan time)
      range = getCustomDateRange(start_date.trim(), end_date.trim());
      if (!range) {
        return res.status(400).json({
          message: 'Invalid start_date or end_date. Use YYYY-MM-DD format and ensure start_date <= end_date.'
        });
      }
      rangeLabel = 'custom';
    } else if (period && VALID_PERIODS.includes(period)) {
      range = getDateRange(period);
      rangeLabel = period;
    } else {
      return res.status(400).json({
        message: 'Provide either period (today|yesterday|this_week|last_week|this_month|last_month|this_year) or both start_date and end_date (YYYY-MM-DD).',
        validPeriods: VALID_PERIODS
      });
    }

    const userId = req.user._id;

    // Active orders only (order_status 0), within date range (orders belong to user via user_id)
    const orders = await Order.find({
      user_id: userId,
      order_status: 0,
      createdAt: { $gte: range.start, $lte: range.end }
    }).sort({ createdAt: -1 });

    const orderIds = orders.map((o) => o._id);
    const allOrderItems = await OrderItem.find({ order_id: { $in: orderIds } }).populate('item_id', 'name');
    const validItems = allOrderItems.filter((item) => item.item_id != null);
    const productIds = [...new Set(validItems.map((item) => item.item_id._id))];
    const { salePrices, buyPrices } = await getLatestPricesForProducts(productIds);

    // Legacy lines without unit_sale_price / unit_buy_price: use price history at order time (not latest global price)
    const histPairs = [];
    orders.forEach((order) => {
      const items = validItems.filter((item) => item.order_id.toString() === order._id.toString());
      items.forEach((item) => {
        const missingSale =
          item.unit_sale_price == null || Number.isNaN(Number(item.unit_sale_price));
        const missingBuy =
          item.unit_buy_price == null || Number.isNaN(Number(item.unit_buy_price));
        if (missingSale || missingBuy) {
          histPairs.push({ productId: item.item_id._id, asOf: order.createdAt });
        }
      });
    });
    const histMap = await getHistoricalPricesAtOrBefore(histPairs);

    const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
    const orderCount = orders.length;
    let totalProfit = 0;
    orders.forEach((order) => {
      const items = validItems.filter((item) => item.order_id.toString() === order._id.toString());
      items.forEach((item) => {
        const pid = item.item_id._id.toString();
        const hKey = historicalPriceKey(item.item_id._id, order.createdAt);
        const hist = histMap.get(hKey);

        let salePrice;
        if (item.unit_sale_price != null && !Number.isNaN(Number(item.unit_sale_price))) {
          salePrice = Number(item.unit_sale_price);
        } else {
          salePrice = hist?.sale != null ? hist.sale : salePrices.get(pid) ?? 0;
        }

        let buyPrice;
        if (item.unit_buy_price != null && !Number.isNaN(Number(item.unit_buy_price))) {
          buyPrice = Number(item.unit_buy_price);
        } else {
          buyPrice = hist?.buy != null ? hist.buy : buyPrices.get(pid) ?? 0;
        }

        totalProfit += (salePrice - (buyPrice * item.quantity));
      });
    });

    res.json({
      period: rangeLabel,
      ...(start_date && end_date && { start_date, end_date }),
      timezone: 'Asia/Karachi (PKT, UTC+5)',
      startDate: range.startPK,
      endDate: range.endPK,
      totalSales,
      totalProfit: Math.round(totalProfit * 100) / 100,
      orderCount
    });
  } catch (error) {
    console.error('getSalesReport error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getSalesReport };
