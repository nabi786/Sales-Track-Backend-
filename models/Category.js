const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  position: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'disable'],
    default: 'active'
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
  is_deleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for faster queries
categorySchema.index({ shop_id: 1 });
categorySchema.index({ customer_id: 1 });
categorySchema.index({ shop_id: 1, customer_id: 1 });
categorySchema.index({ shop_id: 1, status: 1 });

module.exports = mongoose.model('Category', categorySchema);






