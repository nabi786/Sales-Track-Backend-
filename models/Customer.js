const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  phone: {
    type: String,
    trim: true
  },

  address: {
    type: String,
    default: '',
    trim: true
  }

}, {
  timestamps: true
});

// Optimized indexes
customerSchema.index({ user_id: 1, createdAt: -1 });
customerSchema.index({ user_id: 1, phone: 1 });
customerSchema.index({ user_id: 1, name: 1 });

module.exports = mongoose.model('Customer', customerSchema);