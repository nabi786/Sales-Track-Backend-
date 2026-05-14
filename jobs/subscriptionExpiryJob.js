// jobs/subscriptionExpiryJob.js

const cron = require('node-cron');
const Subscription = require('../models/Subscription');

const startSubscriptionExpiryJob = () => {

    // Runs every hour
    cron.schedule('0 * * * *', async () => {
        try {
            console.log('Running subscription expiry job...');
            const now = new Date();

            const result = await Subscription.updateMany(
                {
                    status: 'active',
                    end_date: { $lt: now }
                },
                {
                    $set: {
                        status: 'expired',
                        auto_renew: false
                    }
                }
            );

            console.log(
                `Expired subscriptions updated: ${result.modifiedCount}`
            );

        } catch (error) {
            console.error('Subscription expiry cron error:', error);
        }
    });

};

module.exports = startSubscriptionExpiryJob;