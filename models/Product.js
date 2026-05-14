const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  received_quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  remain_quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  shop_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: false
  },
  is_deleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound indexes — cover all query patterns
productSchema.index({ customer_id: 1, is_deleted: 1 });
productSchema.index({ customer_id: 1, category_id: 1, is_deleted: 1 });
productSchema.index({ customer_id: 1, createdAt: -1 });
productSchema.index({ shop_id: 1, customer_id: 1, is_deleted: 1 });

// Text index for name search
productSchema.index({ name: 'text' });

module.exports = mongoose.model('Product', productSchema);