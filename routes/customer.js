const express = require('express');
const router = express.Router();
const { authenticate, isCustomer, isAdminOrUser } = require('../middleware/auth');
const { uploadShopLogo, handleMulterError } = require('../middleware/upload');
const {
  getProfile,
  updateProfile,
  createShop,
  getMyShops,
  getShopById,
  updateShop,
  deleteShop,
  getMyShop,
  updateMyShop
} = require('../controllers/customerController');
const { getCustomers, createCustomer } = require('../controllers/customerListController');
const { getUdhaarsByCustomerId, payUdhaarByCustomerId } = require('../controllers/udhaarController');
const { SubscriptionStatus } = require('../middleware/subscription')


// All routes require authentication
router.use(authenticate);

// Profile routes (admin or user can access their own profile)
router.get('/profile', isAdminOrUser, getProfile);
router.put('/profile', isAdminOrUser, updateProfile);

// Customers list (Customer model) - admin or user, with optional search by name
router.get('/customers', isAdminOrUser, getCustomers);
router.post('/customers', isAdminOrUser, SubscriptionStatus, createCustomer);
// Udhaars by customer id - admin or user
router.get('/customers/:customerId/udhaars', isAdminOrUser, getUdhaarsByCustomerId);
router.post('/customers/:customerId/udhaars/pay', isAdminOrUser, SubscriptionStatus, payUdhaarByCustomerId);

// Rest of routes require user role only
router.use(isCustomer);

// Shop routes (singular - for logged-in user's shop)
router.get('/shop', getMyShop);
router.put('/shop', (req, res, next) => {
  uploadShopLogo(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  });
}, updateMyShop);

// Shop routes (plural - for multiple shops management)
router.post('/shops', (req, res, next) => {
  uploadShopLogo(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  });
}, createShop);

router.get('/shops', getMyShops);
router.get('/shops/:id', getShopById);
router.put('/shops/:id', (req, res, next) => {
  uploadShopLogo(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  });
}, updateShop);

router.delete('/shops/:id', deleteShop);

module.exports = router;
