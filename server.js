require('dotenv').config();

// Check for required environment variables
if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET is not set in .env file');
  console.error('Please add JWT_SECRET=your-secret-key to your .env file');
  process.exit(1);
}

const startSubscriptionExpiryJob = require('./jobs/subscriptionExpiryJob');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');

const http = require('http');
const { Server } = require('socket.io');

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const customerRoutes = require('./routes/customer');
const productRoutes = require('./routes/product');
const categoryRoutes = require('./routes/category');
const orderRoutes = require('./routes/order');
const reportRoutes = require('./routes/report');
const publicProductRoutes = require('./routes/publicProduct');
// Subscription
const SubscriptionRoutes = require('./routes/subscription');
// whatsapp routes
const whatsappRoutes = require('./routes/whatsapp');

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors());



// create HTTP server
const server = http.createServer(app);

// attach socket.io
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
global.io = io;


// socket connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User joined room: ${userId}`);
  });
});


// Body parsers - only parse JSON/URL encoded, not multipart
app.use((req, res, next) => {
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
    // Skip body parsing for multipart/form-data (let multer handle it)
    return next();
  }
  express.json()(req, res, next);
});

app.use((req, res, next) => {
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
    return next();
  }
  express.urlencoded({ extended: true })(req, res, next);
});

// Serve static files (uploaded images)
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/customer/products', productRoutes);
app.use('/api/customer/categories', categoryRoutes);
app.use('/api/customer/orders', orderRoutes);
app.use('/api/customer/reports', reportRoutes);
app.use('/api/products', publicProductRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api', SubscriptionRoutes);


// cron jobs 
startSubscriptionExpiryJob();



// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'SalesTrack API',
    version: '1.0.0',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

const PORT = process.env.PORT || 8000;

// START SERVER USING HTTP SERVER (IMPORTANT)
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
// Handle port already in use error
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${PORT} is already in use!`);
    console.error(`\nTo fix this, run one of these commands:`);
    console.error(`  Windows: netstat -ano | findstr :${PORT}`);
    console.error(`  Then kill the process: taskkill /F /PID <PID>`);
    console.error(`\nOr use the kill-port script: npm run kill-port\n`);
    process.exit(1);
  } else {
    throw err;
  }
});


// Graceful shutdown (FIXES port already in use forever)
const shutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down server...`);
  server.close(() => {
    console.log('✅ Server closed cleanly');
    process.exit(0);
  });
};

// Handle exit signals
process.on('SIGINT', shutdown);   // Ctrl + C
process.on('SIGTERM', shutdown);
process.on('SIGQUIT', shutdown);

// Catch crashes
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  shutdown('uncaughtException');
});