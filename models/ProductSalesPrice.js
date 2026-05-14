const mongoose = require('mongoose');

const productSalesPriceSchema = new mongoose.Schema({
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

productSalesPriceSchema.index({ product_id: 1 });
productSalesPriceSchema.index({ product_id: 1, createdAt: -1 });

module.exports = mongoose.model('ProductSalesPrice', productSalesPriceSchema);
