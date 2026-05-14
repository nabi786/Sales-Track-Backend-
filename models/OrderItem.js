const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unit_sale_price: {
    type: Number,
    default: null
  },
  unit_buy_price: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

// Indexes (correct place)
orderItemSchema.index({ order_id: 1 });
orderItemSchema.index({ item_id: 1 });

module.exports = mongoose.model('OrderItem', orderItemSchema);