const Customer = require('../models/Customer');

/**
 * GET /api/customer/customers?name=&page=1&limit=10
 * List all customers with optional search by name and pagination.
 * Auth: admin or user.
 */
const getCustomers = async (req, res) => {
  try {

    const { name, page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    // 🔒 IMPORTANT: always filter by user_id
    const query = {
      user_id: req.user.id
    };

    // optional search
    if (name && String(name).trim()) {
      query.name = {
        $regex: String(name).trim(),
        $options: 'i'
      };
    }

    // run queries in parallel (faster)
    const [customers, total] = await Promise.all([
      Customer.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),

      Customer.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return res.json({
      data: customers,
      pagination: {
        currentPage: pageNum,
        totalPages,
        total,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error('getCustomers error:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/customer/customers
 * Create a customer (Customer model). Auth: admin or user.
 * Body: name (required), phone (optional), address (optional).
 */
const createCustomer = async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const customer = new Customer({
      user_id: req.user.id, // 👈 IMPORTANT: link to logged-in user
      name: String(name).trim(),
      phone: phone ? String(phone).trim() : undefined,
      address: address ? String(address).trim() : ''
    });

    await customer.save();

    res.status(201).json({
      message: 'Customer created successfully',
      customer
    });

  } catch (error) {
    console.error('createCustomer error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getCustomers, createCustomer };
