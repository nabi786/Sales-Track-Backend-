const express = require('express');
const router = express.Router();
const { authenticate, isCustomer } = require('../middleware/auth');
const {
  createOrder,
  getAllOrders,
  getOrderById,
  getOrderByUdhaarId
} = require('../controllers/orderController');
const { SubscriptionStatus } = require('../middleware/subscription')

// All routes require authentication and customer role
router.use(authenticate);
router.use(isCustomer);

// Order routes
router.post('/', SubscriptionStatus, createOrder);
router.get('/', getAllOrders);
router.get('/by-udhaar/:udhaarId', getOrderByUdhaarId);
router.get('/:id', getOrderById);

module.exports = router;





