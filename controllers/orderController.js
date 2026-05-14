const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const Udhaar = require('../models/Udhaar');
const Customer = require('../models/Customer');
const Shop = require('../models/Shop');
const mongoose = require('mongoose');
const { getLatestPricesForProducts } = require('../utils/productPrices');
const { formatDateTimePakistan, PK_TZ } = require('../utils/dateRanges');
const { sendWhatsAppMessage } = require('../services/Whatsapp')
const { getPendingUdhaarByCustomer } = require('../utils/udhaar')

// Create order
const createOrder = async (req, res) => {
  try {
    const { orderItems, subTotal, totalPrice, cash_paid, udhaar_amount, udhaar_customer_id } = req.body;

    // --- VALIDATION ---
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0)
      return res.status(400).json({ message: 'Please provide orderItems array with at least one item' });

    if (subTotal === undefined || totalPrice === undefined)
      return res.status(400).json({ message: 'Please provide subTotal and totalPrice' });

    if (subTotal < 0 || totalPrice < 0)
      return res.status(400).json({ message: 'subTotal and totalPrice must be non-negative' });

    if (udhaar_customer_id != null && udhaar_customer_id !== '' && !mongoose.Types.ObjectId.isValid(udhaar_customer_id))
      return res.status(400).json({ message: 'udhaar_customer_id must be a valid ID if provided' });

    // --- FIX 1: Fetch ALL products in ONE query instead of loop ---
    const productIds = orderItems.map((i) => i.id);
    const products = await Product.find({
      _id: { $in: productIds },
      customer_id: req.user._id,
      is_deleted: false
    }).lean();

    // Map for quick lookup
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    // Validate all items against fetched products
    for (const item of orderItems) {
      if (!item.id || !item.quantity || item.quantity < 1)
        return res.status(400).json({ message: 'Each order item must have id and quantity (>= 1)' });

      const product = productMap.get(String(item.id));
      if (!product)
        return res.status(404).json({ message: `Product ${item.id} not found or does not belong to you` });

      const available = product.remain_quantity ?? 0;
      if (available < item.quantity)
        return res.status(400).json({
          message: `Insufficient quantity for "${product.name}". Available: ${available}, requested: ${item.quantity}`
        });
    }

    // --- FIX 2: Fetch shop ONCE, fetch prices in parallel ---
    const [{ salePrices, buyPrices }, shop] = await Promise.all([
      getLatestPricesForProducts(productIds),
      Shop.findOne({ user_id: req.user._id }).lean()
    ]);

    // --- Build order data ---
    const orderData = {
      user_id: req.user._id,
      subtotal: subTotal,
      total: totalPrice
    };
    if (udhaar_customer_id) orderData.customer_id = udhaar_customer_id;
    if (cash_paid != null && cash_paid !== '') orderData.cash_paid = Number(cash_paid);

    // --- FIX 3: Build udhaar + orderItems data before saving anything ---
    const orderItemsData = orderItems.map((item) => {
      const pid = String(item.id);
      const fromPayload = item.price != null && !Number.isNaN(Number(item.price)) ? Number(item.price) : null;
      return {
        item_id: item.id,
        quantity: item.quantity,
        unit_sale_price: fromPayload ?? salePrices.get(pid) ?? null,
        unit_buy_price: buyPrices.get(pid) ?? null
      };
    });

    // --- Save order ---
    const order = new Order(orderData);
    await order.save();

    // --- FIX 4: Run insertMany + bulkWrite + udhaar save all in parallel ---
    const bulkStockUpdates = orderItems.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $inc: { remain_quantity: -item.quantity } }
      }
    }));

    let createdUdhaar = null;
    const parallelTasks = [
      OrderItem.insertMany(orderItemsData.map((d) => ({ ...d, order_id: order._id }))),
      Product.bulkWrite(bulkStockUpdates) // FIX: one query instead of N queries
    ];

    const hasUdhaar = udhaar_amount != null && udhaar_amount !== '' && Number(udhaar_amount) > 0;
    if (hasUdhaar && udhaar_customer_id) {
      createdUdhaar = new Udhaar({
        udhaar: Number(udhaar_amount),
        paid_amount: 0,
        status: 'pending',
        order_id: order._id,
        customer_id: udhaar_customer_id
      });
      parallelTasks.push(createdUdhaar.save());
    }

    const [savedOrderItems] = await Promise.all(parallelTasks);

    // FIX 5: Update order udhaar_id in one save only if needed
    if (createdUdhaar) {
      order.udhaar_id = createdUdhaar._id;
      await order.save();
    }

    // --- Build response ---
    const orderResponse = {
      id: order._id,
      customer_id: order.customer_id ?? null,
      subtotal: order.subtotal,
      total: order.total,
      cash_paid: order.cash_paid ?? null,
      udhaar_id: order.udhaar_id ?? null,
      createdAt: formatDateTimePakistan(order.createdAt),
      updatedAt: formatDateTimePakistan(order.updatedAt),
      ...(createdUdhaar && {
        udhaar: {
          id: createdUdhaar._id,
          udhaar: createdUdhaar.udhaar,
          paid_amount: createdUdhaar.paid_amount,
          status: createdUdhaar.status,
          customer_id: createdUdhaar.customer_id ?? null,
          order_id: createdUdhaar.order_id ?? null
        }
      }),
      orderItems: savedOrderItems.map((item) => ({
        id: item._id,
        orderId: item.order_id,
        itemId: item.item_id,
        itemName: productMap.get(String(item.item_id))?.name ?? '',
        quantity: item.quantity,
        price: item.unit_sale_price
      }))
    };

    // --- FIX 6: Respond FIRST, send WhatsApp AFTER ---
    res.status(201).json({
      message: 'Order created successfully',
      order: orderResponse
    });

    // WhatsApp runs after response is already sent to shopkeeper
    if (createdUdhaar && udhaar_customer_id) {
      sendUdhaarWhatsApp({
        userId: req.user._id,
        customerId: udhaar_customer_id,
        savedOrderItems,
        productMap,
        salePrices,
        createdUdhaar,
        shopName: shop?.shop_name || 'Our Shop',
        orderId: order._id,
        customerTotal: order.total,
        totalPrice,
        udhaar_amount
      }).catch((err) => console.error('WhatsApp send failed:', err));
    }

  } catch (error) {
    console.error('createOrder error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Separate async function for WhatsApp — runs in background
const sendUdhaarWhatsApp = async ({
  userId,
  customerId,
  savedOrderItems,
  productMap,
  salePrices,
  createdUdhaar,
  shopName, orderId, customerTotal, totalPrice, udhaar_amount }) => {
  const customer = await Customer.findById(customerId).lean();
  if (!customer?.phone) return;

  let phone = customer.phone.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '92' + phone.substring(1);

  const totalUdhaar = await getPendingUdhaarByCustomer(customerId);
  const newUdhaar = createdUdhaar?.udhaar || 0;
  const oldUdhaar = totalUdhaar - newUdhaar;

  const itemsText = savedOrderItems.map((item, index) => {
    const name = productMap.get(String(item.item_id))?.name || 'Item';
    const unit = item.unit_sale_price || 0;
    return `${index + 1}. ${item.quantity}x ${name} = Rs.${unit}`;
  }).join('\n');

  const message = `🛍️ Thanks for purchasing from ${shopName}\n\n📦 Your Order Items:\n${itemsText}\n\n💰 Total Bill: Rs.${totalPrice}\n\n📌 New Udhaar: Rs.${udhaar_amount ? udhaar_amount : "0"}\n\n📌 Old Udhaar: Rs.${oldUdhaar}\n\n🧾 Total Payable (Bill + Udhaar): Rs.${totalUdhaar}\n\n🙏 Thanks for your purchase!`;

  await sendWhatsAppMessage(userId.toString(), `${phone}@c.us`, message);
};

// Get all orders for the logged-in customer (newest first) with pagination
const getAllOrders = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const skip = (page - 1) * limit;

    // FIX 1: Run count + find in parallel
    const [total, orders] = await Promise.all([
      Order.countDocuments({ user_id: req.user._id }),
      Order.find({ user_id: req.user._id })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    if (orders.length === 0) {
      return res.json({
        data: [],
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      });
    }

    // FIX 2: Fetch ALL order items for ALL orders in ONE query
    const orderIds = orders.map(o => o._id);
    const allOrderItems = await OrderItem.find({ order_id: { $in: orderIds } })
      .populate('item_id', 'name')
      .lean();

    // FIX 3: Get ALL product prices in ONE call
    const validItems = allOrderItems.filter(item => item.item_id != null);
    const allProductIds = validItems.map(item => item.item_id._id);
    const { salePrices } = await getLatestPricesForProducts(allProductIds);

    // FIX 4: Group order items by order_id using a Map — no more nested queries
    const itemsByOrderId = new Map();
    for (const item of validItems) {
      const oid = item.order_id.toString();
      if (!itemsByOrderId.has(oid)) itemsByOrderId.set(oid, []);
      itemsByOrderId.get(oid).push(item);
    }

    // Build final response using maps — zero DB calls
    const ordersWithItems = orders.map((order) => {
      const oid = order._id.toString();
      const items = itemsByOrderId.get(oid) ?? [];

      return {
        id: order._id,
        user_id: order.user_id ?? null,
        customer_id: order.customer_id ?? null,
        subtotal: order.subtotal,
        total: order.total,
        cash_paid: order.cash_paid ?? null,
        udhaar_id: order.udhaar_id ?? null,
        createdAt: formatDateTimePakistan(order.createdAt),
        updatedAt: formatDateTimePakistan(order.updatedAt),
        orderItems: items.map(item => ({
          id: item._id,
          orderId: item.order_id,
          itemId: item.item_id._id,
          itemName: item.item_id.name,
          quantity: item.quantity,
          price: salePrices.get(item.item_id._id.toString()) ?? null
        }))
      };
    });

    res.json({
      data: ordersWithItems,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('getAllOrders error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get order by ID with full details
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Get order items with full product details (prices from ProductSalesPrice/ProductBuyPrice)
    const orderItems = await OrderItem.find({ order_id: order._id })
      .populate({
        path: 'item_id',
        select: 'name category_id',
        populate: {
          path: 'category_id',
          select: 'name'
        }
      });

    // Filter out items whose product was deleted (item_id null after populate)
    const validOrderItems = orderItems.filter(item => item.item_id != null);
    const productIds = validOrderItems.map(item => item.item_id._id);
    const { salePrices, buyPrices } = await getLatestPricesForProducts(productIds);

    const orderResponse = {
      id: order._id,
      user_id: order.user_id ?? null,
      customer_id: order.customer_id ?? null,
      subtotal: order.subtotal,
      total: order.total,
      cash_paid: order.cash_paid ?? null,
      udhaar_id: order.udhaar_id ?? null,
      createdAt: formatDateTimePakistan(order.createdAt),
      updatedAt: formatDateTimePakistan(order.updatedAt),
      timezone: `${PK_TZ} (PKT, UTC+5)`,
      orderItems: validOrderItems.map(item => {
        const pid = item.item_id._id.toString();
        const itemPrice = salePrices.get(pid) ?? null;
        const itemBuyPrice = buyPrices.get(pid) ?? null;
        return {
          id: item._id,
          orderId: item.order_id,
          itemId: item.item_id._id,
          itemName: item.item_id.name,
          itemPrice,
          itemBuyPrice,
          category: item.item_id.category_id ? {
            id: item.item_id.category_id._id,
            name: item.item_id.category_id.name
          } : null,
          quantity: item.quantity,
          totalPrice: itemPrice != null ? itemPrice * item.quantity : null
        };
      })
    };

    res.json(orderResponse);
  } catch (error) {
    console.error('getOrderById error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get order by udhaar ID (order must belong to logged-in user)
const getOrderByUdhaarId = async (req, res) => {
  try {
    const { udhaarId } = req.params;

    if (!udhaarId || !mongoose.Types.ObjectId.isValid(udhaarId)) {
      return res.status(400).json({ message: 'Valid udhaar ID is required' });
    }

    const order = await Order.findOne({
      udhaar_id: udhaarId,
      user_id: req.user._id
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Get order items with full product details (prices from ProductSalesPrice/ProductBuyPrice)
    const orderItems = await OrderItem.find({ order_id: order._id })
      .populate({
        path: 'item_id',
        select: 'name category_id',
        populate: {
          path: 'category_id',
          select: 'name'
        }
      });

    const validOrderItems = orderItems.filter(item => item.item_id != null);
    const productIds = validOrderItems.map(item => item.item_id._id);
    const { salePrices, buyPrices } = await getLatestPricesForProducts(productIds);

    const orderResponse = {
      id: order._id,
      user_id: order.user_id ?? null,
      customer_id: order.customer_id ?? null,
      subtotal: order.subtotal,
      total: order.total,
      cash_paid: order.cash_paid ?? null,
      udhaar_id: order.udhaar_id ?? null,
      createdAt: formatDateTimePakistan(order.createdAt),
      updatedAt: formatDateTimePakistan(order.updatedAt),
      timezone: `${PK_TZ} (PKT, UTC+5)`,
      orderItems: validOrderItems.map(item => {
        const pid = item.item_id._id.toString();
        const itemPrice = salePrices.get(pid) ?? null;
        const itemBuyPrice = buyPrices.get(pid) ?? null;
        return {
          id: item._id,
          orderId: item.order_id,
          itemId: item.item_id._id,
          itemName: item.item_id.name,
          itemPrice,
          itemBuyPrice,
          category: item.item_id.category_id ? {
            id: item.item_id.category_id._id,
            name: item.item_id.category_id.name
          } : null,
          quantity: item.quantity,
          totalPrice: itemPrice != null ? itemPrice * item.quantity : null
        };
      })
    };

    res.json(orderResponse);
  } catch (error) {
    console.error('getOrderByUdhaarId error:', error);
    res.status(500).json({ message: error.message });
  }
};






module.exports = {
  createOrder,
  getAllOrders,
  getOrderById,
  getOrderByUdhaarId
};





