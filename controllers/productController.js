const Product = require('../models/Product');
const ProductImage = require('../models/ProductImage');
const ProductSalesPrice = require('../models/ProductSalesPrice');
const ProductBuyPrice = require('../models/ProductBuyPrice');
const Category = require('../models/Category');
const Shop = require('../models/Shop');
const { getLatestPricesForProducts } = require('../utils/productPrices');

// Create product (with multiple image uploads) - automatically uses logged-in user's shop
const createProduct = async (req, res) => {
  try {
    const { name, sale_price, buy_price, category_id, received_quantity, remain_quantity } = req.body;

    if (!name || !sale_price || !buy_price) {
      return res.status(400).json({
        message: 'Please provide name, sale_price, and buy_price'
      });
    }

    // Parse numeric fields (may come as strings from form/multipart)
    const salePriceNum = typeof sale_price === 'string' ? parseFloat(sale_price) : sale_price;
    const buyPriceNum = typeof buy_price === 'string' ? parseFloat(buy_price) : buy_price;
    const receivedQty = received_quantity !== undefined && received_quantity !== ''
      ? (typeof received_quantity === 'string' ? parseInt(received_quantity, 10) : received_quantity)
      : 0;
    const remainQty = remain_quantity !== undefined && remain_quantity !== ''
      ? (typeof remain_quantity === 'string' ? parseInt(remain_quantity, 10) : remain_quantity)
      : 0;

    if (isNaN(salePriceNum) || salePriceNum < 0) {
      return res.status(400).json({ message: 'Sale price must be a non-negative number' });
    }
    if (isNaN(buyPriceNum) || buyPriceNum < 0) {
      return res.status(400).json({ message: 'Buy price must be a non-negative number' });
    }
    if (isNaN(receivedQty) || receivedQty < 0) {
      return res.status(400).json({ message: 'Received quantity must be a non-negative number' });
    }
    if (isNaN(remainQty) || remainQty < 0) {
      return res.status(400).json({ message: 'Remain quantity must be a non-negative number' });
    }

    // Automatically get the shop for the logged-in user
    const shop = await Shop.findOne({
      customer_id: req.user._id
    });

    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user. Please create a shop first.' });
    }

    // If category_id is provided, verify it belongs to the customer (not checking shop_id)
    if (category_id) {
      const category = await Category.findOne({
        _id: category_id,
        customer_id: req.user._id,
        is_deleted: false
      });

      if (!category) {
        return res.status(404).json({ message: 'Category not found or does not belong to this user' });
      }
    }

    const product = new Product({
      name,
      received_quantity: receivedQty,
      remain_quantity: remainQty,
      shop_id: shop._id,
      customer_id: req.user._id,
      category_id: category_id || undefined
    });

    await product.save();

    // Create initial price history for reports
    await ProductSalesPrice.create({ product_id: product._id, price: salePriceNum });
    await ProductBuyPrice.create({ product_id: product._id, price: buyPriceNum });

    // Populate category if it exists
    if (product.category_id) {
      await product.populate('category_id', 'name _id');
    }

    // Handle product images upload (up to 4 images)
    let firstImageUrl = null;
    if (req.files && req.files.length > 0) {
      const imagePromises = req.files.map((file, index) => {
        return ProductImage.create({
          product_id: product._id,
          image_url: `/uploads/product-images/${file.filename}`,
          image_order: index
        });
      });
      await Promise.all(imagePromises);

      // Get first image URL
      const firstImage = await ProductImage.findOne({ product_id: product._id })
        .sort({ image_order: 1 });
      if (firstImage) {
        firstImageUrl = firstImage.image_url;
      }
    }

    // Return with current prices from history (just created)
    const productData = {
      id: product._id,
      name: product.name,
      sale_price: salePriceNum,
      buy_price: buyPriceNum,
      received_quantity: product.received_quantity,
      remain_quantity: product.remain_quantity,
      image: firstImageUrl,
      category: product.category_id ? {
        id: product.category_id._id,
        name: product.category_id.name
      } : null
    };

    res.status(201).json({
      message: 'Product created successfully',
      product: productData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all products for the logged-in customer with pagination
const getMyProducts = async (req, res) => {
  try {
    const { shop_id, page = 1, limit = 10, search } = req.query;
    const query = { customer_id: req.user._id, is_deleted: false };

    if (shop_id) {
      query.shop_id = shop_id;
    }

    // Optional: search by product name (case-insensitive)
    if (search && search.trim()) {
      query.name = { $regex: search.trim(), $options: 'i' }; // Case-insensitive search
    }

    // Parse pagination parameters
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // Get total count for pagination metadata
    const totalProducts = await Product.countDocuments(query);

    // Get paginated products - select only needed fields (prices from ProductSalesPrice/ProductBuyPrice)
    const products = await Product.find(query)
      .select('name received_quantity remain_quantity category_id')
      .populate('category_id', 'name _id')
      .sort({ createdAt: -1 }) // Sort by newest first
      .skip(skip)
      .limit(limitNumber);

    const productIds = products.map(p => p._id);
    const { salePrices, buyPrices } = await getLatestPricesForProducts(productIds);

    // Get first image for each product and attach populated prices
    const productsWithFirstImage = await Promise.all(
      products.map(async (product) => {
        const firstImage = await ProductImage.findOne({ product_id: product._id })
          .sort({ image_order: 1 });
        const pid = product._id.toString();
        return {
          id: product._id,
          name: product.name,
          sale_price: salePrices.get(pid) ?? null,
          buy_price: buyPrices.get(pid) ?? null,
          received_quantity: product.received_quantity,
          remain_quantity: product.remain_quantity,
          image: firstImage ? firstImage.image_url : null,
          category: product.category_id ? {
            id: product.category_id._id,
            name: product.category_id.name
          } : null
        };
      })
    );

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalProducts / limitNumber);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

    res.json({
      products: productsWithFirstImage,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalProducts,
        limit: limitNumber,
        hasNextPage,
        hasPrevPage
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get product by ID
const getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      customer_id: req.user._id,
      is_deleted: false
    })
      .populate('shop_id', 'shop_name')
      .populate('category_id', 'name');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get product images
    const images = await ProductImage.find({ product_id: product._id })
      .sort({ image_order: 1 });

    const { salePrices, buyPrices } = await getLatestPricesForProducts([product._id]);
    const pid = product._id.toString();
    const productData = product.toObject();
    productData.sale_price = salePrices.get(pid) ?? null;
    productData.buy_price = buyPrices.get(pid) ?? null;
    productData.images = images;

    res.json(productData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update product
const updateProduct = async (req, res) => {
  try {
    // Parse JSON fields from body (if sent as JSON string in multipart form)
    let name, sale_price, buy_price, received_quantity, remain_quantity, category_id;

    if (req.body.name !== undefined) name = req.body.name;
    if (req.body.sale_price !== undefined) sale_price = typeof req.body.sale_price === 'string' ? parseFloat(req.body.sale_price) : req.body.sale_price;
    if (req.body.buy_price !== undefined) buy_price = typeof req.body.buy_price === 'string' ? parseFloat(req.body.buy_price) : req.body.buy_price;
    if (req.body.received_quantity !== undefined) received_quantity = typeof req.body.received_quantity === 'string' ? parseInt(req.body.received_quantity, 10) : req.body.received_quantity;
    if (req.body.remain_quantity !== undefined) remain_quantity = typeof req.body.remain_quantity === 'string' ? parseInt(req.body.remain_quantity, 10) : req.body.remain_quantity;
    if (req.body.category_id !== undefined) category_id = req.body.category_id === '' ? null : req.body.category_id;

    // Check if product exists and belongs to the customer (and is not deleted)
    const existingProduct = await Product.findOne({
      _id: req.params.id,
      customer_id: req.user._id,
      is_deleted: false
    });

    if (!existingProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const updateData = {};

    // Validate and update name
    if (name !== undefined) {
      if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'Product name cannot be empty' });
      }
      updateData.name = name.trim();
    }

    // Validate sale_price and buy_price (only for creating history records; Product has no price fields)
    if (sale_price !== undefined) {
      if (isNaN(sale_price) || sale_price < 0) {
        return res.status(400).json({ message: 'Sale price must be a non-negative number' });
      }
    }
    if (buy_price !== undefined) {
      if (isNaN(buy_price) || buy_price < 0) {
        return res.status(400).json({ message: 'Buy price must be a non-negative number' });
      }
    }

    // When received_quantity is sent: remain_quantity += received_quantity and received_quantity += received_quantity (add new stock)
    if (received_quantity !== undefined) {
      if (isNaN(received_quantity) || received_quantity < 0) {
        return res.status(400).json({ message: 'Received quantity must be a non-negative number' });
      }
      const currentRemain = existingProduct.remain_quantity ?? 0;
      const currentReceived = existingProduct.received_quantity ?? 0;
      updateData.remain_quantity = currentRemain + received_quantity;
      updateData.received_quantity = currentReceived + received_quantity;
    } else if (remain_quantity !== undefined) {
      // Direct update of remain_quantity only when received_quantity not sent
      if (isNaN(remain_quantity) || remain_quantity < 0) {
        return res.status(400).json({ message: 'Remain quantity must be a non-negative number' });
      }
      updateData.remain_quantity = remain_quantity;
    }

    // Handle category_id update
    let unsetFields = {};
    if (category_id !== undefined) {
      if (category_id === null || category_id === '') {
        // Remove category
        unsetFields.category_id = 1;
      } else {
        // Verify category belongs to customer and product's shop
        const category = await Category.findOne({
          _id: category_id,
          customer_id: req.user._id,
          shop_id: existingProduct.shop_id,
          is_deleted: false
        });

        if (!category) {
          return res.status(404).json({ message: 'Category not found or does not belong to this shop' });
        }

        updateData.category_id = category_id;
      }
    }

    // Handle image uploads if files are provided
    if (req.files && req.files.length > 0) {
      // Validate new images count (maximum 4 images allowed)
      const newImagesCount = req.files.length;

      if (newImagesCount > 4) {
        return res.status(400).json({
          message: `Maximum 4 images allowed. Trying to upload ${newImagesCount} images`
        });
      }

      // Delete all existing images for this product
      await ProductImage.deleteMany({ product_id: existingProduct._id });

      // Add new images
      const imagePromises = req.files.map((file, index) => {
        return ProductImage.create({
          product_id: existingProduct._id,
          image_url: `/uploads/product-images/${file.filename}`,
          image_order: index
        });
      });

      await Promise.all(imagePromises);
    }

    // Check if there's anything to update (product fields or images)
    if (Object.keys(updateData).length === 0 && Object.keys(unsetFields).length === 0 && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Build update query with $unset if needed
    const updateQuery = { ...updateData };
    if (Object.keys(unsetFields).length > 0) {
      updateQuery.$unset = unsetFields;
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, customer_id: req.user._id },
      updateQuery,
      { new: true }
    )
      .populate('category_id', 'name _id');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Create price history records for reports (which product sold at which price)
    if (sale_price !== undefined) {
      await ProductSalesPrice.create({
        product_id: product._id,
        price: sale_price
      });
    }
    if (buy_price !== undefined) {
      await ProductBuyPrice.create({
        product_id: product._id,
        price: buy_price
      });
    }

    // Get first image for the product (matching GET products format)
    const firstImage = await ProductImage.findOne({ product_id: product._id })
      .sort({ image_order: 1 });

    const { salePrices, buyPrices } = await getLatestPricesForProducts([product._id]);
    const pid = product._id.toString();

    // Return with populated prices from history
    const productData = {
      id: product._id,
      name: product.name,
      sale_price: salePrices.get(pid) ?? null,
      buy_price: buyPrices.get(pid) ?? null,
      received_quantity: product.received_quantity,
      remain_quantity: product.remain_quantity,
      image: firstImage ? firstImage.image_url : null,
      category: product.category_id ? {
        id: product.category_id._id,
        name: product.category_id.name
      } : null
    };

    res.json({
      message: 'Product updated successfully',
      product: productData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete product (soft delete - sets is_deleted to true)
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        customer_id: req.user._id,
        is_deleted: false
      },
      { is_deleted: true },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add images to existing product
const addProductImages = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      customer_id: req.user._id,
      is_deleted: false
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check current image count
    const currentImageCount = await ProductImage.countDocuments({ product_id: product._id });
    const newImagesCount = req.files ? req.files.length : 0;

    if (currentImageCount + newImagesCount > 4) {
      return res.status(400).json({
        message: `Maximum 4 images allowed. Currently have ${currentImageCount}, trying to add ${newImagesCount}`
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images provided' });
    }

    // Add new images
    const imagePromises = req.files.map((file, index) => {
      return ProductImage.create({
        product_id: product._id,
        image_url: `/uploads/product-images/${file.filename}`,
        image_order: currentImageCount + index
      });
    });

    await Promise.all(imagePromises);

    // Get all product images
    const images = await ProductImage.find({ product_id: product._id })
      .sort({ image_order: 1 });

    res.json({
      message: 'Images added successfully',
      images
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete product image
const deleteProductImage = async (req, res) => {
  try {
    const { imageId } = req.params;

    const image = await ProductImage.findById(imageId);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Verify product belongs to customer and is not deleted
    const product = await Product.findOne({
      _id: image.product_id,
      customer_id: req.user._id,
      is_deleted: false
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found or access denied' });
    }

    await ProductImage.findByIdAndDelete(imageId);

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all products (public API) with pagination and filters
const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, name } = req.query;

    // Build query - only get non-deleted products
    const query = { is_deleted: false };

    // Filter by category if provided
    if (category) {
      query.category_id = category;
    }

    // Filter by product name if provided (case-insensitive search)
    if (name && name.trim()) {
      query.name = { $regex: name.trim(), $options: 'i' };
    }

    // Parse pagination parameters
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // Get total count for pagination metadata
    const totalProducts = await Product.countDocuments(query);

    // Get paginated products
    const products = await Product.find(query)
      .select('name _id category_id')
      .sort({ createdAt: -1 }) // Sort by newest first
      .skip(skip)
      .limit(limitNumber);

    const productIds = products.map(p => p._id);
    const { salePrices } = await getLatestPricesForProducts(productIds);

    // Get first image for each product and attach current sale price
    const productsWithFirstImage = await Promise.all(
      products.map(async (product) => {
        const firstImage = await ProductImage.findOne({ product_id: product._id })
          .sort({ image_order: 1 });
        const pid = product._id.toString();
        return {
          id: product._id,
          name: product.name,
          price: salePrices.get(pid) ?? null,
          image: firstImage ? firstImage.image_url : null
        };
      })
    );

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalProducts / limitNumber);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

    res.json({
      products: productsWithFirstImage,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalProducts,
        limit: limitNumber,
        hasNextPage,
        hasPrevPage
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get products for the logged-in customer (same response shape as getProducts)
const getProductsForUser = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, name } = req.query;

    const query = { customer_id: req.user._id, is_deleted: false };
    if (category) query.category_id = category;
    if (name && name.trim()) query.name = { $regex: name.trim(), $options: 'i' };

    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // FIX 1: Run count + find in parallel instead of sequential
    const [totalProducts, products] = await Promise.all([
      Product.countDocuments(query),
      Product.find(query)
        .select('name _id category_id remain_quantity')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean() // FIX 2: .lean() returns plain JS object, faster than Mongoose document
    ]);

    const productIds = products.map(p => p._id);

    // FIX 3: Fetch ALL images in ONE query instead of one per product
    const [{ salePrices }, allImages] = await Promise.all([
      getLatestPricesForProducts(productIds),
      ProductImage.find({ product_id: { $in: productIds } })
        .sort({ image_order: 1 })
        .lean()
    ]);

    // Build image map — first image per product
    const imageMap = new Map();
    for (const img of allImages) {
      const pid = img.product_id.toString();
      if (!imageMap.has(pid)) {
        imageMap.set(pid, img.image_url); // first image only (already sorted)
      }
    }

    // Build final response using maps — no DB calls
    const productsWithDetails = products.map((product) => {
      const pid = product._id.toString();
      return {
        id: product._id,
        name: product.name,
        price: salePrices.get(pid) ?? null,
        image: imageMap.get(pid) ?? null,
        remain_quantity: product.remain_quantity ?? 0
      };
    });

    const totalPages = Math.ceil(totalProducts / limitNumber);

    res.json({
      products: productsWithDetails,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalProducts,
        limit: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1
      }
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createProduct,
  getMyProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  addProductImages,
  deleteProductImage,
  getProducts,
  getProductsForUser
};

