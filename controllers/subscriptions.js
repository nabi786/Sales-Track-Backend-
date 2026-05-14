const Subscription = require('../models/Subscription');

const getMySubscription = async (req, res) => {
    try {
        const userId = req.user.id;

        const subscription = await Subscription.findOne({
            user_id: userId
        })
            .select('plan billing_cycle status start_date end_date auto_renew payment_status')
            .lean();

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'No subscription found'
            });
        }

        return res.status(200).json(subscription);

    } catch (error) {
        console.error('getMySubscription error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = { getMySubscription };