# SalesTrack API

A simple Express.js application for sales tracking with MongoDB.

## Features

- Admin authentication and management
- Customer management (only admins can create customers)
- Shop management (customers can create shops)
- Product management (customers can create products for their shops)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (already created) with:
```
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your-secret-key
PORT=8000
```

3. Create the initial admin user:
```bash
node scripts/createAdmin.js
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login (admin or customer)

### Admin Routes (requires admin authentication)
- `GET /api/admin/admins` - Get all admins
- `GET /api/admin/admins/:id` - Get admin by ID
- `POST /api/admin/customers` - Create customer
- `GET /api/admin/customers` - Get all customers
- `GET /api/admin/customers/:id` - Get customer by ID
- `PUT /api/admin/customers/:id/status` - Update customer status
- `DELETE /api/admin/customers/:id` - Delete customer

### Customer Routes (requires customer authentication)
- `GET /api/customer/profile` - Get customer profile
- `PUT /api/customer/profile` - Update customer profile
- `POST /api/customer/shops` - Create shop
- `GET /api/customer/shops` - Get all customer's shops
- `GET /api/customer/shops/:id` - Get shop by ID
- `PUT /api/customer/shops/:id` - Update shop
- `DELETE /api/customer/shops/:id` - Delete shop
- `POST /api/customer/products` - Create product
- `GET /api/customer/products` - Get all customer's products with pagination (optional query params: ?shop_id=xxx&page=1&limit=10)
- `GET /api/customer/products/:id` - Get product by ID
- `PUT /api/customer/products/:id` - Update product
- `DELETE /api/customer/products/:id` - Delete product

## Authentication

All protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Default Admin Credentials

After running `node scripts/createAdmin.js`:
- Email: admin@salestrack.com
- Password: admin123

**Please change the password after first login!**

## Data Models

### Admin
- first_name
- last_name
- email
- phone
- role (admin)
- password

### Customer
- first_name
- last_name
- email
- phone
- role (customer)
- password
- status (active, disabled)

### Shop
- shop_name
- logo
- phone
- address
- customer_id

### Product
- name
- image
- sale_price
- buy_price
- quantity
- shop_id
- customer_id

