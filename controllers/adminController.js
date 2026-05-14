const User = require('../models/User');
const Shop = require('../models/Shop');
const { createTrialSubscriptionForUser } = require('../utils/subscription');
const Subscription = require('../models/Subscription')

const moment = require('moment-timezone')

const pakistanTime = moment().tz("Asia/Karachi").toDate();

// Register admin (public endpoint for first admin creation - only one admin allowed)
const registerAdmin = async (req, res) => {
  try {
    const { first_name, last_name, email, phone, password } = req.body;

    if (!first_name || !last_name || !email || !phone || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin already exists. Only one admin is allowed.' });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Check if phone already exists
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ message: 'User with this phone number already exists' });
    }

    const admin = new User({
      first_name,
      last_name,
      email,
      phone,
      password,
      role: 'admin',
      status: 'active'
    });

    await admin.save();
    admin.password = undefined;

    res.status(201).json({
      message: 'Admin registered successfully',
      admin
    });
  } catch (error) {
    if (error.message.includes('Only one admin')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// Create user with role 'user' (only admin can do this)
const createUser = async (req, res) => {
  try {
    const { first_name, last_name, email, phone, password, status } = req.body;

    if (!first_name || !last_name || !email || !phone || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedPhone = String(phone).trim();

    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const existingPhone = await User.findOne({ phone: trimmedPhone });
    if (existingPhone) {
      return res.status(400).json({ message: 'User with this phone number already exists' });
    }
    const existingShop = await Shop.findOne({ shop_email: normalizedEmail });
    if (existingShop) {
      return res.status(400).json({ message: 'Shop with this email already exists' });
    }
    const newUser = new User({
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: normalizedEmail,
      phone: trimmedPhone,
      password,
      role: 'user',
      status: status || 'active'
    });

    await newUser.save();
    newUser.password = undefined;

    // Create a shop for the new user (shop_name = first_name, shop_email = email, phone = phone, address = default empty)
    const shop = new Shop({
      shop_name: first_name.trim(),
      shop_email: normalizedEmail,
      phone: trimmedPhone,
      address: '',
      user_id: newUser._id,
      customer_id: newUser._id
    });
    await shop.save();

    let subscription = await createTrialSubscriptionForUser(newUser._id);

    res.status(201).json({
      message: 'User created successfully',
      user: {
        ...newUser.toObject(),
        subscription: {
          _id: subscription._id,
          status: subscription.status,
          end_date: subscription.end_date
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create customer (only admin can do this)
const createCustomer = async (req, res) => {
  try {
    const { first_name, last_name, email, phone, password, status } = req.body;

    if (!first_name || !last_name || !email || !phone || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Check if phone already exists
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ message: 'User with this phone number already exists' });
    }

    const customer = new User({
      first_name,
      last_name,
      email,
      phone,
      password,
      role: 'customer',
      status: status || 'active'
    });

    await customer.save();
    customer.password = undefined;

    res.status(201).json({
      message: 'User created successfully',
      customer
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all customers
const getAllCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' }).select('-password');
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all users (customers only, for admin only) with pagination
const getAllUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);

    const skip = (page - 1) * limit;

    // Run both queries in parallel
    const [users, total] = await Promise.all([

      User.aggregate([
        {
          $match: {
            role: 'user'
          }
        },

        // Only select needed fields early
        {
          $project: {
            password: 0
          }
        },

        {
          $lookup: {
            from: 'subscriptions',
            let: { userId: '$_id' },

            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$user_id', '$$userId']
                  }
                }
              },

              // Only fetch required fields
              {
                $project: {
                  _id: 1,
                  status: 1,
                  end_date: 1
                }
              }
            ],

            as: 'subscription'
          }
        },

        // Convert array -> object
        {
          $addFields: {
            subscription: {
              $arrayElemAt: ['$subscription', 0]
            }
          }
        },

        {
          $sort: {
            createdAt: -1
          }
        },

        {
          $skip: skip
        },

        {
          $limit: limit
        }
      ]),

      User.countDocuments({ role: 'user' })

    ]);

    return res.status(200).json({
      data: users,

      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        limit,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('GET USERS ERROR:', error);

    return res.status(500).json({
      message: 'Internal server error'
    });
  }
};

// Toggle user status by ID (active <-> disabled)
const deactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    user.status = newStatus;
    await user.save();

    res.json({
      message: newStatus === 'disabled' ? 'User deactivated successfully' : 'User activated successfully',
      user
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update user by ID (admin only; can update first_name, last_name, email, phone, status)
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const {
      first_name,
      last_name,
      email,
      phone,
      status,
      user_subscription_status,
    } = req.body;

    const updateUserData = {};

    // ---------------- USER FIELDS ----------------
    if (first_name !== undefined) {
      const trimmed = String(first_name).trim();
      if (!trimmed)
        return res
          .status(400)
          .json({ message: "First name cannot be empty" });
      updateUserData.first_name = trimmed;
    }

    if (last_name !== undefined) {
      const trimmed = String(last_name).trim();
      if (!trimmed)
        return res
          .status(400)
          .json({ message: "Last name cannot be empty" });
      updateUserData.last_name = trimmed;
    }

    if (email !== undefined) {
      const normalizedEmail = String(email).toLowerCase().trim();
      if (!normalizedEmail)
        return res.status(400).json({ message: "Email cannot be empty" });

      const existing = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: req.params.id },
      });

      if (existing)
        return res
          .status(400)
          .json({ message: "User with this email already exists" });

      updateUserData.email = normalizedEmail;
    }

    if (phone !== undefined) {
      const trimmed = String(phone).trim();
      if (!trimmed)
        return res.status(400).json({ message: "Phone cannot be empty" });

      const existing = await User.findOne({
        phone: trimmed,
        _id: { $ne: req.params.id },
      });

      if (existing)
        return res
          .status(400)
          .json({ message: "User with this phone number already exists" });

      updateUserData.phone = trimmed;
    }

    if (status !== undefined) {
      if (!["active", "disabled"].includes(status)) {
        return res
          .status(400)
          .json({ message: "Status must be active or disabled" });
      }

      updateUserData.status = status;
    }

    if (Object.keys(updateUserData).length === 0 && !user_subscription_status) {
      return res.status(400).json({
        message:
          "Provide at least one field to update (first_name, last_name, email, phone, status)",
      });
    }

    // ---------------- SUBSCRIPTION ----------------
    let subscription = null;

    if (user_subscription_status) {
      const subStatus =
        user_subscription_status === "active"
          ? "active"
          : user_subscription_status === "cancelled"
            ? "cancelled"
            : user_subscription_status;

      const subUpdate = {
        status: subStatus,
        updated_at: new Date(),
      };

      if (subStatus === "active") {
        const startDate = new Date(); // or Pakistan time if needed
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);

        subUpdate.start_date = startDate;
        subUpdate.end_date = endDate;
      }

      subscription = await Subscription.findOneAndUpdate(
        { user_id: req.params.id },
        { $set: subUpdate },
        { new: true }
      ).select("status end_date plan billing_cycle auto_renew");
    }

    // ---------------- UPDATE USER ----------------
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateUserData },
      { new: true }
    ).select("-password");

    // ---------------- FINAL RESPONSE ----------------
    return res.json({
      message: "User updated successfully",
      user: {
        ...updatedUser.toObject(),
        subscription,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get customer by ID
const getCustomerById = async (req, res) => {
  try {
    const customer = await User.findOne({ _id: req.params.id, role: 'customer' }).select('-password');
    if (!customer) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update customer status
const updateCustomerStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['active', 'disabled'].includes(status)) {
      return res.status(400).json({ message: 'Please provide valid status (active or disabled)' });
    }

    const customer = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'customer' },
      { status },
      { new: true }
    ).select('-password');

    if (!customer) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'User status updated successfully',
      customer
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete customer
const deleteCustomer = async (req, res) => {
  try {
    const customer = await User.findOneAndDelete({ _id: req.params.id, role: 'customer' });
    if (!customer) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerAdmin,
  createUser,
  createCustomer,
  getAllCustomers,
  getAllUsers,
  deactivateUser,
  updateUser,
  getCustomerById,
  updateCustomerStatus,
  deleteCustomer
};

