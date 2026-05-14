const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Ensure the database name is in the URI
    let mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('ERROR: MONGODB_URI is not set in .env file');
      process.exit(1);
    }
    
    // Remove any surrounding quotes (single or double) that might be in .env file
    mongoUri = mongoUri.trim().replace(/^['"]|['"]$/g, '');
    
    // Extract or add database name
    let dbName = 'salestrack';
    const dbNamePattern = /\/([^\/\?]+)(?:\?|$)/;
    const match = mongoUri.match(dbNamePattern);
    
    // Check if we have a valid database name
    // (must not contain @ or : which would mean we captured user:pass@host from mongodb+srv URI)
    if (match && match[1]) {
      const potentialDbName = match[1];
      const isValidDbName = potentialDbName && potentialDbName.length > 0 &&
        !potentialDbName.includes('&') && !potentialDbName.includes('=') &&
        !potentialDbName.includes('@') && !potentialDbName.includes(':');
      if (isValidDbName) {
        dbName = potentialDbName;
      } else {
        // Invalid database name, add it
        const queryIndex = mongoUri.indexOf('?');
        if (queryIndex !== -1) {
          mongoUri = mongoUri.slice(0, queryIndex) + '/salestrack' + mongoUri.slice(queryIndex);
        } else {
          mongoUri = mongoUri.replace(/\/$/, '') + '/salestrack';
        }
      }
    } else {
      // No database name found, add it
      const queryIndex = mongoUri.indexOf('?');
      if (queryIndex !== -1) {
        mongoUri = mongoUri.slice(0, queryIndex) + '/salestrack' + mongoUri.slice(queryIndex);
      } else {
        mongoUri = mongoUri.replace(/\/$/, '') + '/salestrack';
      }
    }
    
    // Connection options for better timeout handling
    const options = {
      dbName: dbName, // Explicitly set database name
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
      connectTimeoutMS: 30000, // 30 seconds
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority'
    };
    
    console.log('Attempting to connect to MongoDB...');
    // Log connection attempt (without password)
    const uriForLog = mongoUri.replace(/:[^:@]+@/, ':****@');
    console.log(`Connecting to: ${uriForLog}`);
    console.log(`Database Name: ${dbName}`);
    
    const conn = await mongoose.connect(mongoUri, options);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`✅ Database Name: ${conn.connection.name}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    
    // Provide specific guidance based on error type
    if (error.message.includes('bad auth') || error.message.includes('Authentication failed')) {
      console.error('\n🔴 AUTHENTICATION FAILED - This means:');
      console.error('   • Your username or password is incorrect');
      console.error('   • OR your database user doesn\'t have proper permissions');
      console.error('\n📝 How to fix:');
      console.error('1. Go to MongoDB Atlas: https://cloud.mongodb.com/');
      console.error('2. Navigate to: Database Access (left sidebar)');
      console.error('3. Find your user: rehanpardesi2018_db_user');
      console.error('4. Click "Edit" and verify/reset the password');
      console.error('5. Make sure the user has "Atlas admin" or "Read and write to any database" role');
      console.error('6. Update your .env file with the correct password');
      console.error('\n⚠️  Also check:');
      console.error('   • Network Access → Add your IP address (or 0.0.0.0/0 for testing)');
      console.error('   • Make sure your cluster is running (not paused)');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('timeout')) {
      console.error('\n🔴 CONNECTION TIMEOUT - This means:');
      console.error('   • Your IP address is not whitelisted');
      console.error('   • OR your cluster is paused');
      console.error('\n📝 How to fix:');
      console.error('1. Go to MongoDB Atlas: https://cloud.mongodb.com/');
      console.error('2. Navigate to: Network Access (left sidebar)');
      console.error('3. Click "Add IP Address"');
      console.error('4. Add your current IP or use 0.0.0.0/0 (allows all IPs - less secure)');
      console.error('5. Wait 1-2 minutes for changes to take effect');
    } else if (error.message.includes('Invalid namespace')) {
      console.error('\n🔴 INVALID NAMESPACE ERROR - This means:');
      console.error('   • The database name in the connection string is malformed');
      console.error('   • OR there\'s an issue with how the URI is being parsed');
      console.error('\n📝 How to fix:');
      console.error('1. Check your MONGODB_URI format in .env file');
      console.error('2. The format should be: mongodb://user:pass@host1,host2,host3/database?options');
      console.error('3. Make sure the database name comes BEFORE the ? (query parameters)');
      console.error('4. Try removing /salestrack from your URI and let the code add it automatically');
    } else {
      console.error('\n🔍 General Troubleshooting Steps:');
      console.error('1. Check if your IP address is whitelisted in MongoDB Atlas');
      console.error('   - Go to: https://cloud.mongodb.com/ → Network Access');
      console.error('2. Verify your MONGODB_URI in .env file is correct');
      console.error('3. Check if your MongoDB Atlas cluster is running (not paused)');
      console.error('4. Verify your database username and password are correct');
    }
    
    console.error('\n💡 For more help: https://www.mongodb.com/docs/atlas/security-whitelist/');
    process.exit(1);
  }
};

module.exports = connectDB;

