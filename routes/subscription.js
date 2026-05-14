const express = require('express');
const router = express.Router();
const { authenticate, isCustomer } = require('../middleware/auth');
const { getMySubscription } = require('../controllers/subscriptions.js');



// All routes require authentication
router.use(authenticate);
router.get('/my/subscription', getMySubscription);

module.exports = router;