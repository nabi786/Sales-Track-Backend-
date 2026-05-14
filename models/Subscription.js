const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  plan: {
    type: String,
    enum: ['basic', 'standard', 'pro'],
    required: true
  },
  billing_cycle: {
    type: String,
    enum: ['monthly', 'yearly', 'trial'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'paused'],
    default: 'active'
  },
  start_date: {
    type: Date,
    required: true
  },
  end_date: {
    type: Date,
    required: true
  },
  auto_renew: {
    type: Boolean,
    default: false
  },
  payment_status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  payment_method: {
    type: String,
    enum: {
      values: ['easypaisa', 'jazzcash', 'stripe', 'bank'],
      message: 'Invalid payment method'
    },
    default: 'easypaisa'
  },
  transaction_id: {
    type: String,
    default: null,
    trim: true
  },
  amount: {
    type: Number,
    default: null
  },
  currency: {
    type: String,
    default: 'PKR',
    trim: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

subscriptionSchema.index({ user_id: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
