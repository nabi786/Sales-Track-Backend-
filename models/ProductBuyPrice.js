const mongoose = require('mongoose');

const productBuyPriceSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
}, {
  timestamps: true
});

productBuyPriceSchema.index({ product_id: 1 });
productBuyPriceSchema.index({ product_id: 1, createdAt: -1 });

module.exports = mongoose.model('ProductBuyPrice', productBuyPriceSchema);
