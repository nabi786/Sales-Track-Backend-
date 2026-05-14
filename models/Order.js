const mongoose = require('mongoose');

// ❌ REMOVE OrderItem import completely (not needed here)

const orderSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  // 0 = active, 1 = deleted, 2 = return
  order_status: {
    type: Number,
    default: 0,
    enum: [0, 1, 2]
  },
  cash_paid: {
    type: Number,
    default: null
  },
  udhaar_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Udhaar',
    default: null
  },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  }
}, {
  timestamps: true
});

// Indexes for faster queries
orderSchema.index({ user_id: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ user_id: 1, createdAt: -1 });
orderSchema.index({ order_status: 1 });
orderSchema.index({ udhaar_id: 1 });
orderSchema.index({ customer_id: 1 });

module.exports = mongoose.model('Order', orderSchema);