const User = require('../models/User');
const Verification = require('../models/Verification');
const Shop = require('../models/Shop');
const generateToken = require('../utils/generateToken');
const sendEmail = require('../utils/email');

// Login (for both admin and customer)
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Only allow login if user status is active
    if (user.status === 'disabled') {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id, user.role);

    // Prepare response object
    const response = {
      token,
      user: {
        id: user._id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status || undefined
      }
    };

    // If customer, also fetch and include shop
    if (user.role === 'customer') {
      const shop = await Shop.findOne({ customer_id: user._id });
      if (shop) {
        response.shop = shop;
      }
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin login (only admin can login)
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email, role: 'admin' });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials or not an admin' });
    }

    if (user.status === 'disabled') {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id, user.role);

    res.json({
      token,
      user: {
        id: user._id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get profile (for both admin and customer)
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Forgot password - generate and save verification code
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Please provide email' });
    }

    // Check if customer exists with this email
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      return res.status(404).json({ message: 'Invalid email' });
    }

    // Generate 6-digit random code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Save or update verification code for this email
    await Verification.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { 
        email: email.toLowerCase().trim(),
        code: code
      },
      { 
        upsert: true, 
        new: true 
      }
    );

    // Send verification code via email
    await sendEmail({
      to: email,
      subject: 'Password Reset Verification Code',
      html: `<p>Your verification code is <strong>${code}</strong>. It will expire soon.</p>`
    });

    res.json({
      message: 'Verification code has been generated and sent to your email'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Verify email with code (does not delete verification)
const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: 'Please provide email and code' });
    }

    // Check if customer exists with this email
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      return res.status(404).json({ message: 'Invalid email' });
    }

    // Check if email and code exist in Verification model
    const verification = await Verification.findOne({
      email: email.toLowerCase().trim(),
      code: code
    });

    if (!verification) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    res.json({
      message: 'Verification successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reset password using email and verification code
const resetPassword = async (req, res) => {
  try {
    const { email, password, code } = req.body;

    if (!email || !password || !code) {
      return res.status(400).json({ message: 'Please provide email, password, and code' });
    }

    // Check if customer exists with this email
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      return res.status(404).json({ message: 'Invalid email' });
    }

    // Check if email and code exist in Verification model
    const verification = await Verification.findOne({
      email: email.toLowerCase().trim(),
      code: code
    });

    if (!verification) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    // Update password (pre-save hook will hash it)
    user.password = password;
    await user.save();

    // Delete verification record after successful reset
    await Verification.deleteOne({
      email: email.toLowerCase().trim(),
      code: code
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { login, adminLogin, getProfile, forgotPassword, verifyEmail, resetPassword };

