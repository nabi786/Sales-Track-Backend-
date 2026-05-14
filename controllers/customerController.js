const User = require('../models/User');
const Shop = require('../models/Shop');
const { expireSubscriptionIfPast } = require('../utils/subscription');
const Product = require('../models/Product');
const fs = require('fs').promises;
const path = require('path');

// Get customer profile
const getProfile = async (req, res) => {
  try {
    await expireSubscriptionIfPast(req.user._id);
    const user = await User.findById(req.user._id).select('-password');
    const shop = await Shop.findOne({ customer_id: req.user._id });
    res.json({
      ...user.toObject(),
      shop
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update customer profile (only first_name, last_name, phone, and password can be updated)
const updateProfile = async (req, res) => {
  try {
    const { first_name, last_name, phone, old_password, new_password } = req.body;
    const updateData = {};

    // Validate that at least one field is provided
    if (!first_name && !last_name && !phone && !old_password && !new_password) {
      return res.status(400).json({ 
        message: 'Please provide at least one field to update (first_name, last_name, phone, or password)' 
      });
    }

    // Handle password change - only if BOTH old_password and new_password are provided
    if (old_password && new_password) {
      if (new_password.trim() === '') {
        return res.status(400).json({ message: 'New password cannot be empty' });
      }

      // Get current customer with password to verify old password
      const currentUser = await User.findById(req.user._id);
      
      if (!currentUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Verify old password matches
      const isOldPasswordValid = await currentUser.comparePassword(old_password);
      
      if (!isOldPasswordValid) {
        return res.status(400).json({ message: 'Invalid old password' });
      }

      // Old password is valid, update to new password
      updateData.password = new_password;
    } else if (old_password || new_password) {
      // If only one password field is provided, return error
      return res.status(400).json({ 
        message: 'Both old_password and new_password are required' 
      });
    }

    // Update first_name if provided
    if (first_name !== undefined) {
      if (!first_name || first_name.trim() === '') {
        return res.status(400).json({ message: 'First name cannot be empty' });
      }
      updateData.first_name = first_name.trim();
    }

    // Update last_name if provided
    if (last_name !== undefined) {
      if (!last_name || last_name.trim() === '') {
        return res.status(400).json({ message: 'Last name cannot be empty' });
      }
      updateData.last_name = last_name.trim();
    }
    
    // Check if phone is being updated and if it's already taken
    if (phone !== undefined) {
      if (!phone || phone.trim() === '') {
        return res.status(400).json({ message: 'Phone number cannot be empty' });
      }
      
      const trimmedPhone = phone.trim();
      
      // Get current customer to check if phone is actually changing
      const currentUser = await User.findById(req.user._id).select('phone');
      
      // Only check for uniqueness if the phone number is different from current
      if (currentUser && currentUser.phone !== trimmedPhone) {
        const existingPhone = await User.findOne({ 
          phone: trimmedPhone, 
          _id: { $ne: req.user._id } 
        });
        
        if (existingPhone) {
          return res.status(400).json({ message: 'Phone number already exists' });
        }
      }
      
      updateData.phone = trimmedPhone;
    }

    // Get customer and update fields (use save() to trigger pre-save hook for password hashing)
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields
    if (updateData.first_name) user.first_name = updateData.first_name;
    if (updateData.last_name) user.last_name = updateData.last_name;
    if (updateData.phone) user.phone = updateData.phone;
    if (updateData.password) user.password = updateData.password; // Will be hashed by pre-save hook

    // Save to trigger pre-save hook (which will hash the password)
    await user.save();

    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      message: 'Profile updated successfully',
      customer: userResponse
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create shop (with optional logo upload)
const createShop = async (req, res) => {
  try {
    const { shop_name, shop_email, phone, address } = req.body;

    if (!shop_name || !shop_email || !phone || !address) {
      return res.status(400).json({ message: 'Please provide shop_name, shop_email, phone, and address' });
    }

    // Enforce one shop per customer
    const existingShop = await Shop.findOne({ customer_id: req.user._id });
    if (existingShop) {
      return res.status(400).json({ message: 'Customer already has a shop' });
    }

    // Check if shop_email already exists
    const existingEmail = await Shop.findOne({ shop_email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Shop with this email already exists' });
    }

    // Check if phone already exists
    const existingPhone = await Shop.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ message: 'Shop with this phone number already exists' });
    }

    // Handle logo upload if file exists
    let logoUrl = '';
    if (req.file) {
      logoUrl = `/uploads/shop-logos/${req.file.filename}`;
    }

    const shop = new Shop({
      shop_name,
      logo: logoUrl,
      shop_email,
      phone,
      address,
      customer_id: req.user._id
    });

    await shop.save();
    await shop.populate('customer_id', 'first_name last_name email');

    res.status(201).json({
      message: 'Shop created successfully',
      shop
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all shops for the logged-in customer
const getMyShops = async (req, res) => {
  try {
    const shops = await Shop.find({ customer_id: req.user._id })
      .populate('customer_id', 'first_name last_name email');
    
    // Get product counts for each shop (only non-deleted products)
    const shopsWithCounts = await Promise.all(
      shops.map(async (shop) => {
        const productCount = await Product.countDocuments({ shop_id: shop._id, is_deleted: false });
        return {
          ...shop.toObject(),
          product_count: productCount
        };
      })
    );
    
    res.json(shopsWithCounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get shop by ID
const getShopById = async (req, res) => {
  try {
    const shop = await Shop.findOne({
      _id: req.params.id,
      customer_id: req.user._id
    }).populate('customer_id', 'first_name last_name email');

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Get products for this shop (only non-deleted products)
    const products = await Product.find({ shop_id: shop._id, is_deleted: false });
    const shopData = shop.toObject();
    shopData.products = products;
    shopData.product_count = products.length;

    res.json(shopData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update shop (with optional logo upload)
const updateShop = async (req, res) => {
  try {
    const { shop_name, shop_email, phone, address } = req.body;
    const updateData = {};

    // Get current shop to check for old logo
    const currentShop = await Shop.findOne({
      _id: req.params.id,
      customer_id: req.user._id
    });

    if (!currentShop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    if (shop_name) updateData.shop_name = shop_name;
    if (address) updateData.address = address;

    // Check if shop_email is being updated and if it's already taken
    if (shop_email) {
      const existingEmail = await Shop.findOne({ 
        shop_email, 
        _id: { $ne: req.params.id } 
      });
      if (existingEmail) {
        return res.status(400).json({ message: 'Shop email already exists' });
      }
      updateData.shop_email = shop_email;
    }

    // Check if phone is being updated and if it's already taken
    if (phone) {
      const existingPhone = await Shop.findOne({ 
        phone, 
        _id: { $ne: req.params.id } 
      });
      if (existingPhone) {
        return res.status(400).json({ message: 'Shop phone number already exists' });
      }
      updateData.phone = phone;
    }

    // Handle logo upload if file exists
    if (req.file) {
      // Delete old logo if it exists
      if (currentShop.logo && currentShop.logo.trim() !== '') {
        try {
          // Remove leading slash and construct file path
          const oldLogoPath = currentShop.logo.startsWith('/') 
            ? currentShop.logo.substring(1) 
            : currentShop.logo;
          const fullPath = path.join(process.cwd(), oldLogoPath);
          
          // Check if file exists and delete it
          await fs.access(fullPath);
          await fs.unlink(fullPath);
        } catch (error) {
          // If file doesn't exist or can't be deleted, just log and continue
          // Don't fail the update if old logo deletion fails
          console.log('Could not delete old logo:', error.message);
        }
      }
      
      updateData.logo = `/uploads/shop-logos/${req.file.filename}`;
    }

    const shop = await Shop.findOneAndUpdate(
      { _id: req.params.id, customer_id: req.user._id },
      updateData,
      { new: true }
    );

    res.json({
      message: 'Shop updated successfully',
      shop
    });
  } catch (error) {
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `Shop ${field === 'shop_email' ? 'email' : 'phone'} already exists` 
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// Delete shop
const deleteShop = async (req, res) => {
  try {
    const shop = await Shop.findOneAndDelete({
      _id: req.params.id,
      customer_id: req.user._id
    });

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Delete all products associated with this shop
    await Product.deleteMany({ shop_id: req.params.id });

    res.json({ message: 'Shop and associated products deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get shop for logged-in user (singular - no ID needed)
const getMyShop = async (req, res) => {
  try {
    const shop = await Shop.findOne({ customer_id: req.user._id });

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    res.json(shop);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update shop for logged-in user (singular - no ID needed)
const updateMyShop = async (req, res) => {
  try {
    const { shop_name, shop_email, phone, address } = req.body;
    const updateData = {};

    // Find the shop for the logged-in user
    const currentShop = await Shop.findOne({ customer_id: req.user._id });
    
    if (!currentShop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Validate that at least one field is provided
    if (!shop_name && !shop_email && !phone && !address && !req.file) {
      return res.status(400).json({ 
        message: 'Please provide at least one field to update (shop_name, shop_email, phone, address, or logo)' 
      });
    }

    // Update shop_name if provided
    if (shop_name !== undefined) {
      if (!shop_name || shop_name.trim() === '') {
        return res.status(400).json({ message: 'Shop name cannot be empty' });
      }
      updateData.shop_name = shop_name.trim();
    }

    // Update address if provided
    if (address !== undefined) {
      if (!address || address.trim() === '') {
        return res.status(400).json({ message: 'Address cannot be empty' });
      }
      updateData.address = address.trim();
    }

    // Check if shop_email is being updated and if it's already taken
    if (shop_email !== undefined) {
      if (!shop_email || shop_email.trim() === '') {
        return res.status(400).json({ message: 'Shop email cannot be empty' });
      }
      
      const trimmedEmail = shop_email.trim().toLowerCase();
      
      // Only check for uniqueness if the email is different from current
      if (currentShop.shop_email !== trimmedEmail) {
        const existingEmail = await Shop.findOne({ 
          shop_email: trimmedEmail, 
          _id: { $ne: currentShop._id } 
        });
        
        if (existingEmail) {
          return res.status(400).json({ message: 'Shop email already exists' });
        }
      }
      updateData.shop_email = trimmedEmail;
    }

    // Check if phone is being updated and if it's already taken
    if (phone !== undefined) {
      if (!phone || phone.trim() === '') {
        return res.status(400).json({ message: 'Phone number cannot be empty' });
      }
      
      const trimmedPhone = phone.trim();
      
      // Only check for uniqueness if the phone is different from current
      if (currentShop.phone !== trimmedPhone) {
        const existingPhone = await Shop.findOne({ 
          phone: trimmedPhone, 
          _id: { $ne: currentShop._id } 
        });
        
        if (existingPhone) {
          return res.status(400).json({ message: 'Shop phone number already exists' });
        }
      }
      updateData.phone = trimmedPhone;
    }

    // Handle logo upload if file exists
    if (req.file) {
      // Delete old logo if it exists
      if (currentShop.logo && currentShop.logo.trim() !== '') {
        try {
          // Remove leading slash and construct file path
          const oldLogoPath = currentShop.logo.startsWith('/') 
            ? currentShop.logo.substring(1) 
            : currentShop.logo;
          const fullPath = path.join(process.cwd(), oldLogoPath);
          
          // Check if file exists and delete it
          await fs.access(fullPath);
          await fs.unlink(fullPath);
        } catch (error) {
          // If file doesn't exist or can't be deleted, just log and continue
          // Don't fail the update if old logo deletion fails
          console.log('Could not delete old logo:', error.message);
        }
      }
      
      updateData.logo = `/uploads/shop-logos/${req.file.filename}`;
    }

    const shop = await Shop.findOneAndUpdate(
      { customer_id: req.user._id },
      updateData,
      { new: true }
    );

    res.json({
      message: 'Shop updated successfully',
      shop
    });
  } catch (error) {
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `Shop ${field === 'shop_email' ? 'email' : 'phone'} already exists` 
      });
    }
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  createShop,
  getMyShops,
  getShopById,
  updateShop,
  deleteShop,
  getMyShop,
  updateMyShop
};
