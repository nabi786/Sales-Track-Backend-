const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  code: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
verificationSchema.index({ email: 1 });
verificationSchema.index({ code: 1 });
verificationSchema.index({ email: 1, code: 1 });

module.exports = mongoose.model('Verification', verificationSchema);






