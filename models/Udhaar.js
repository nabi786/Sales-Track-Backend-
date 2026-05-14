const mongoose = require('mongoose');

const udhaarSchema = new mongoose.Schema({
  udhaar: {
    type: Number,
    required: true
  },
  paid_amount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending'
  },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  }
}, {
  timestamps: true
});

// When udhaar (remaining) is 0 or less, or paid_amount >= udhaar, set status to 'paid'
udhaarSchema.pre('save', function (next) {
  if (this.udhaar != null && this.udhaar <= 0) {
    this.status = 'paid';
  } else if (this.paid_amount != null && this.udhaar != null && this.paid_amount >= this.udhaar) {
    this.status = 'paid';
  }
  next();
});

udhaarSchema.index({ customer_id: 1 });
udhaarSchema.index({ order_id: 1 });

module.exports = mongoose.model('Udhaar', udhaarSchema);
