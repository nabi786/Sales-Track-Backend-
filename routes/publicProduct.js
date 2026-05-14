const express = require('express');
const router = express.Router();
const { authenticate, isCustomer } = require('../middleware/auth');
const { getProductsForUser } = require('../controllers/productController');

// Products for logged-in customer only (filtered by customer_id)
router.get('/', authenticate, isCustomer, getProductsForUser);

module.exports = router;

