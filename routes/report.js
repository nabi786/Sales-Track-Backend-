const express = require('express');
const router = express.Router();
const { authenticate, isCustomer } = require('../middleware/auth');
const { getSalesReport } = require('../controllers/reportController');

router.use(authenticate);
router.use(isCustomer);

router.get('/sales', getSalesReport);

module.exports = router;
