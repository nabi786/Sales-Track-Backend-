const express = require('express');
const router = express.Router();
const { authenticate, isCustomer } = require('../middleware/auth');
const {
  createCategory,
  getAllCategories,
  getAllCategoriesSimple,
  getCategoryById,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');
const { SubscriptionStatus } = require('../middleware/subscription')
// All routes require authentication and customer role
router.use(authenticate);
router.use(isCustomer);

// Category routes
router.post('/', SubscriptionStatus, createCategory);
router.get('/', getAllCategories);
router.get('/simple', getAllCategoriesSimple);
router.get('/:id', getCategoryById);
router.put('/:id', SubscriptionStatus, updateCategory);
router.delete('/:id', SubscriptionStatus, deleteCategory);

module.exports = router;


