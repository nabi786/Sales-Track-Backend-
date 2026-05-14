const mongoose = require('mongoose');
const { formatDateTimePakistan } = require('../utils/dateRanges');
const { sendWhatsAppMessage } = require('../services/Whatsapp');
const Udhaar = require('../models/Udhaar');
const Customer = require('../models/Customer');
const { getPendingUdhaarByCustomer } = require('../utils/udhaar')
/**
 * Build udhaar list response for a customer (same format for GET list and POST pay).
 */
async function buildUdhaarListResponse(customerId, page = 1, limit = 10) {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const skip = (pageNum - 1) * limitNum;

  const query = {
    customer_id: customerId
  };

  // Total documents
  const total = await Udhaar.countDocuments(query);

  // Get udhaar list
  const udhaars = await Udhaar.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .populate('order_id', 'subtotal total createdAt')
    .lean();

  // Calculate total remaining udhaar
  const totalRemainResult = await Udhaar.aggregate([
    {
      $match: {
        customer_id: new mongoose.Types.ObjectId(customerId)
      }
    },
    {
      $project: {
        remain: {
          $max: [
            0,
            {
              $subtract: [
                { $ifNull: ['$udhaar', 0] },
                { $ifNull: ['$paid_amount', 0] }
              ]
            }
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        total_udhaar_remain: {
          $sum: '$remain'
        }
      }
    }
  ]);

  const total_udhaar_remain =
    totalRemainResult[0]?.total_udhaar_remain || 0;

  // Format response data
  const data = udhaars.map((u) => {
    const totalUdhaar = u.udhaar || 0;
    const paidAmount = u.paid_amount || 0;

    const remaining = Math.max(0, totalUdhaar - paidAmount);

    return {
      _id: u._id,

      // Original udhaar amount
      udhaar: totalUdhaar,

      // Paid amount
      paid_amount: paidAmount,

      // Remaining amount
      udhaar_remain: remaining,

      // Dynamic status
      status: remaining <= 0 ? 'paid' : 'pending',

      customer_id: u.customer_id,

      order_id: u.order_id
        ? {
          _id: u.order_id._id,
          subtotal: u.order_id.subtotal,
          total: u.order_id.total,
          createdAt: formatDateTimePakistan(
            u.order_id.createdAt
          )
        }
        : null,

      createdAt: formatDateTimePakistan(u.createdAt),
      updatedAt: formatDateTimePakistan(u.updatedAt),

      __v: u.__v || 0
    };
  });

  const totalPages = Math.ceil(total / limitNum);

  return {
    data,

    // Total remaining udhaar of customer
    total_udhaar_remain,

    pagination: {
      currentPage: pageNum,
      totalPages,
      total,
      limit: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    }
  };
}

/**
 * POST /api/customer/customers/:customerId/udhaars/pay
 * Pay udhaar for a customer. Body: { amount }. Query: page, limit. Returns same shape as GET list.
 */
const payUdhaarByCustomerId = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { amount } = req.body;
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: 'Valid customer ID is required' });
    }

    const payAmount = Number(amount);
    if (Number.isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    // Get pending udhaar (FIFO)
    const pendingUdhaars = await Udhaar.find({
      customer_id: customerId,
      status: 'pending'
    }).sort({ createdAt: 1 });

    if (!pendingUdhaars.length) {
      return res.status(400).json({
        message: 'No pending udhaar found',
        totalPending: 0
      });
    }

    // calculate total remaining correctly
    const totalPending = pendingUdhaars.reduce(
      (sum, u) => sum + ((u.udhaar || 0) - (u.paid_amount || 0)),
      0
    );

    if (totalPending <= 0) {
      return res.status(400).json({
        message: 'No pending amount left',
        totalPending: 0
      });
    }

    let remainingPay = payAmount;

    for (const u of pendingUdhaars) {
      if (remainingPay <= 0) break;

      const remainingDebt = (u.udhaar || 0) - (u.paid_amount || 0);

      if (remainingDebt <= 0) continue;

      const payNow = Math.min(remainingPay, remainingDebt);

      await Udhaar.findByIdAndUpdate(u._id, {
        $inc: { paid_amount: payNow },
        $set: {
          status: (remainingDebt - payNow === 0) ? 'paid' : 'pending'
        }
      });

      remainingPay -= payNow;
    }

    const totalAllocated = payAmount - remainingPay;
    const excess = remainingPay;

    const list = await buildUdhaarListResponse(customerId, page, limit);

    // WhatsApp message
    const customer = await Customer.findById(customerId).lean();

    if (customer?.phone) {
      let phone = customer.phone.replace(/\D/g, '');

      if (phone.startsWith('0')) {
        phone = '92' + phone.substring(1);
      }

      const message = `
🧾 Udhaar Payment Received

💰 Paid Amount: Rs.${payAmount}
📌 Remaining Udhaar: Rs.${list.total_udhaar_remain}

Thank you for your payment 🙏
`;

      await sendWhatsAppMessage(
        req.user._id.toString(),
        phone,
        message
      );
    }

    return res.json({
      message: 'Payment applied successfully',
      customer_id: customerId,
      amount_paid: payAmount,
      amount_allocated: totalAllocated,
      excess_refund: excess,
      total_pending_before: totalPending,
      total_udhaar_remain: list.total_udhaar_remain,
      data: list.data,
      pagination: list.pagination
    });

  } catch (error) {
    console.error('payUdhaarByCustomerId error:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/customer/customers/:customerId/udhaars?page=1&limit=10
 * Get all udhaar records for a customer. Auth: admin or user.
 */
const getUdhaarsByCustomerId = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: 'Valid customer ID is required' });
    }

    const list = await buildUdhaarListResponse(customerId, page, limit);
    res.json(list);
  } catch (error) {
    console.error('getUdhaarsByCustomerId error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getUdhaarsByCustomerId, payUdhaarByCustomerId };
