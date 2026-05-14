const express = require('express');
const router = express.Router();
const { login, adminLogin, getProfile, forgotPassword, verifyEmail, resetPassword } = require('../controllers/authController');
const { registerAdmin } = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');

// @route   POST /api/auth/admin/login
// @desc    Admin login (only admin can login)
// @access  Public
router.post('/admin/login', adminLogin);

// @route   POST /api/auth/register-admin
// @desc    Register admin (public endpoint)
// @access  Public
router.post('/register-admin', registerAdmin);

// @route   POST /api/auth/login
// @desc    Login (admin or customer)
// @access  Public
router.post('/login', login);

// @route   POST /api/auth/forgot-password
// @desc    Generate verification code for password reset
// @access  Public
router.post('/forgot-password', forgotPassword);

// @route   POST /api/auth/verify-email
// @desc    Verify email with code
// @access  Public
router.post('/verify-email', verifyEmail);

// @route   POST /api/auth/reset-password
// @desc    Reset password using email, code, and new password
// @access  Public
router.post('/reset-password', resetPassword);

// @route   GET /api/auth/profile
// @desc    Get user profile (admin or customer)
// @access  Private (requires token)
router.get('/profile', authenticate, getProfile);

module.exports = router;

