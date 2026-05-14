const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Subscription = require('../models/Subscription')

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("token", token)
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }
    
    // Check if customer account is disabled
    if (user.role === 'customer' && user.status === 'disabled') {
      return res.status(403).json({ message: 'Account is disabled' });
    }
    console.log("user is here", user)
    
    req.user = user;
    next();
  } catch (error) {
   
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin only.' });
  }
};

// Check if user is customer
const isCustomer = (req, res, next) => {
  if (req.user && req.user.role === 'user') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. user only.' });
  }
};

// Allow both admin and user (for profile etc.)
const isAdminOrUser = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'user')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied.' });
  }
};

module.exports = { authenticate, isAdmin, isCustomer, isAdminOrUser };

