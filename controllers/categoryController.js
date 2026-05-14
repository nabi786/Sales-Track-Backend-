const Category = require('../models/Category');
const Shop = require('../models/Shop');
const Product = require('../models/Product');

// Create category (automatically uses logged-in user's shop from token)
const createCategory = async (req, res) => {
  try {
    const { name, position, status } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Please provide name' });
    }

    // Automatically get the shop for the logged-in user
    const shop = await Shop.findOne({
      customer_id: req.user._id
    });

    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user. Please create a shop first.' });
    }

    const category = new Category({
      name,
      position: position !== undefined ? position : 0,
      status: status || 'active',
      shop_id: shop._id,
      customer_id: req.user._id
    });

    await category.save();
    await category.populate('shop_id', 'shop_name');

    res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all categories by user ID (from token) with optional shop_id filter, search by name, and pagination
const getAllCategories = async (req, res) => {
  try {
    const { shop_id, category } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const skip = (page - 1) * limit;

    // Base query: get all categories for the logged-in user (from token) that are not deleted
    const query = { customer_id: req.user._id, is_deleted: false };
    
    // Optional: filter by shop_id if provided
    if (shop_id) {
      // Verify that the shop belongs to the customer
      const shop = await Shop.findOne({
        _id: shop_id,
        customer_id: req.user._id
      });

      if (!shop) {
        return res.status(404).json({ message: 'Shop not found or access denied' });
      }
      query.shop_id = shop_id;
    }

    // Optional: search by category name (case-insensitive)
    if (category && category.trim()) {
      query.name = { $regex: category.trim(), $options: 'i' }; // Case-insensitive search
    }

    const total = await Category.countDocuments(query);

    const categories = await Category.find(query)
      .populate('shop_id', 'shop_name')
      .sort({ position: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get product counts for each category (only non-deleted products)
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const productCount = await Product.countDocuments({ category_id: category._id, is_deleted: false });
        const categoryData = category.toObject();
        categoryData.product_count = productCount;
        return categoryData;
      })
    );

    res.json({
      data: categoriesWithCounts,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get category by ID
const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      customer_id: req.user._id,
      is_deleted: false
    }).populate('shop_id', 'shop_name');

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Get products for this category (only non-deleted products)
    const products = await Product.find({ category_id: category._id, is_deleted: false })
      .populate('shop_id', 'shop_name');
    
    const categoryData = category.toObject();
    categoryData.products = products;
    categoryData.product_count = products.length;

    res.json(categoryData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update category
const updateCategory = async (req, res) => {
  try {
    const { name, position, status } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (position !== undefined) updateData.position = position;
    if (status) {
      if (status !== 'active' && status !== 'disable') {
        return res.status(400).json({ message: 'Status must be either "active" or "disable"' });
      }
      updateData.status = status;
    }

    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, customer_id: req.user._id, is_deleted: false },
      updateData,
      { new: true }
    ).populate('shop_id', 'shop_name');

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete category (soft delete - sets is_deleted to true)
const deleteCategory = async (req, res) => {
  try {
    // Find category and check if it exists and belongs to the user
    const category = await Category.findOne({
      _id: req.params.id,
      customer_id: req.user._id,
      is_deleted: false
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Soft delete: set is_deleted to true instead of actually deleting
    await Category.findByIdAndUpdate(
      req.params.id,
      { is_deleted: true },
      { new: true }
    );

    // Remove category_id from all products that have this category
    await Product.updateMany(
      { category_id: req.params.id },
      { $unset: { category_id: 1 } }
    );

    res.json({ 
      message: 'Category deleted successfully. Products linked to this category have been unlinked.' 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all categories (simple list - id and name only, no pagination)
const getAllCategoriesSimple = async (req, res) => {
  try {
    // Get all non-deleted and active categories for the logged-in user
    const categories = await Category.find({
      customer_id: req.user._id,
      is_deleted: false,
      status: 'active'
    })
      .select('_id name')
      .sort({ position: 1, createdAt: -1 });

    // Format response to use 'id' instead of '_id'
    const formattedCategories = categories.map(category => ({
      id: category._id,
      name: category.name
    }));

    res.json(formattedCategories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createCategory,
  getAllCategories,
  getAllCategoriesSimple,
  getCategoryById,
  updateCategory,
  deleteCategory
};

