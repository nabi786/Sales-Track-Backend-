const Subscription = require('../models/Subscription');

const TRIAL_DAYS = 30;

function buildTrialDates() {
  const start_date = new Date();
  const end_date = new Date(start_date);
  end_date.setDate(end_date.getDate() + TRIAL_DAYS);
  return { start_date, end_date };
}

/**
 * Create a trial subscription for a user (basic plan, 30 days, pending payment).
 */
async function createTrialSubscriptionForUser(userId) {
  const { start_date, end_date } = buildTrialDates();
  const sub = new Subscription({
    user_id: userId,
    plan: 'basic',
    billing_cycle: 'trial',
    status: 'active',
    start_date,
    end_date,
    auto_renew: false,
    payment_status: 'pending',
    payment_method: 'easypaisa',
    transaction_id: null,
    amount: null,
    currency: 'PKR'
  });
  await sub.save();
  return sub;
}

/**
 * If trial/end date has passed and status is still active, set status to expired.
 */
async function expireSubscriptionIfPast(userId) {
  const sub = await Subscription.findOne({ user_id: userId });
  if (!sub) return null;
  if (sub.status === 'active' && sub.end_date && new Date() > new Date(sub.end_date)) {
    sub.status = 'expired';
    await sub.save();
  }
  return sub;
}

module.exports = {
  createTrialSubscriptionForUser,
  expireSubscriptionIfPast,
  TRIAL_DAYS
};
