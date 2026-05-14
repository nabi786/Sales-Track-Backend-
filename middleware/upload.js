const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, '../uploads');
const shopLogosDir = path.join(uploadsDir, 'shop-logos');
const productImagesDir = path.join(uploadsDir, 'product-images');

[uploadsDir, shopLogosDir, productImagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Storage configuration for shop logos (single file)
const shopLogoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, shopLogosDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'shop-logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Storage configuration for product images (multiple files)
const productImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, productImagesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter for images
const imageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// Multer upload configurations
const uploadShopLogo = multer({
  storage: shopLogoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: imageFilter
}).single('logo');

const uploadProductImages = multer({
  storage: productImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 4 // Maximum 4 images
  },
  fileFilter: imageFilter
}).array('images', 4); // Maximum 4 images

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err && err.code && err.code.startsWith('LIMIT_')) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 5MB' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files. Maximum 4 images allowed' });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

module.exports = {
  uploadShopLogo,
  uploadProductImages,
  handleMulterError
};

