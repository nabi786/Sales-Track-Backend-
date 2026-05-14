const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Subscription = require('../models/Subscription')

// Verify JWT token
const SubscriptionStatus = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select('-password');
        let User_Subscription = null
        if (user) {
            User_Subscription = await Subscription.findOne({ user_id: decoded.id })
        }

        if (User_Subscription && User_Subscription.status !== 'active') {
            return res.status(402).json({
                subscription_status: User_Subscription?.status,
                message: `Your subscription is currently ${User_Subscription?.status}. Please contact the admin to renew your subscription.`
            });
        }

        req.subscription = User_Subscription;
        next();

    } catch (error) {
        console.log("error is", error)
        res.status(401).json({ message: 'Token is not valid' });
    }
};

module.exports = { SubscriptionStatus };