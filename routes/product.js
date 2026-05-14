const express = require('express');
const router = express.Router();
const { authenticate, isCustomer } = require('../middleware/auth');
const { uploadProductImages, handleMulterError } = require('../middleware/upload');
const {
  createProduct,
  getMyProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  addProductImages,
  deleteProductImage
} = require('../controllers/productController');
const { SubscriptionStatus } = require('../middleware/subscription')

// All routes require authentication and customer role
router.use(authenticate);
router.use(isCustomer);

// Product routes
router.post('/', SubscriptionStatus, (req, res, next) => {
  uploadProductImages(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  });
}, createProduct);

router.get('/', getMyProducts);
router.get('/:id', getProductById);
router.put('/:id', SubscriptionStatus, (req, res, next) => {
  uploadProductImages(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  });
}, updateProduct);
router.delete('/:id', SubscriptionStatus, deleteProduct);

// Product image routes
router.post('/:id/images', SubscriptionStatus, (req, res, next) => {
  uploadProductImages(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  });
}, addProductImages);

router.delete('/images/:imageId', deleteProductImage);

module.exports = router;

