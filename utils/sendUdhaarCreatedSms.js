/**
 * Twilio SMS when an Udhaar is created (order with udhaar).
 *
 * Env (required to actually send):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_MESSAGING_SERVICE_SID
 *
 * Optional:
 *   TWILIO_PHONE_COUNTRY_CODE — default "92" (Pakistan) when normalizing local numbers
 */

const TWILIO_API_VERSION = '2010-04-01';

/**
 * Normalize phone toward E.164. If already starts with +, keep (trimmed).
 * Otherwise prepend country code (default Pakistan 92), drop leading 0.
 */
function normalizePhoneForTwilio(rawPhone, countryCode = process.env.TWILIO_PHONE_COUNTRY_CODE || '92') {
  if (rawPhone == null || String(rawPhone).trim() === '') return null;
  let d = String(rawPhone).replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) {
    return d.length >= 10 ? d : null;
  }
  if (d.startsWith('0')) d = d.slice(1);
  const cc = String(countryCode).replace(/^\+/, '');
  if (!d.startsWith(cc)) d = cc + d;
  return `+${d}`;
}

/**
 * Build SMS body: shop, customer, udhaar, order summary, line items.
 */
function buildUdhaarSmsBody({
  shopName,
  customerName,
  udhaar,
  order,
  orderLineItems,
  currency = 'PKR'
}) {
  const name = shopName || 'Shop';
  const greet = customerName ? `Hello ${customerName},` : 'Hello,';
  const lines = [];

  lines.push(`${name}`);
  lines.push('Udhaar (credit) recorded');
  lines.push(greet);

  if (order) {
    if (order.total != null) lines.push(`Order total: ${currency} ${order.total}`);
    if (order.cash_paid != null && order.cash_paid > 0) {
      lines.push(`Cash paid: ${currency} ${order.cash_paid}`);
    }
  }

  if (udhaar) {
    lines.push(`Udhaar amount: ${currency} ${udhaar.udhaar}`);
    lines.push(`Paid so far: ${currency} ${udhaar.paid_amount ?? 0}`);
    lines.push(`Status: ${udhaar.status || 'pending'}`);
  }

  if (orderLineItems && orderLineItems.length > 0) {
    lines.push('Items:');
    orderLineItems.forEach((row, i) => {
      const qty = row.quantity ?? 1;
      const nm = row.name || 'Item';
      let part = `${i + 1}) ${nm} x${qty}`;
      if (row.unitPrice != null) part += ` @${currency} ${row.unitPrice}`;
      if (row.lineTotal != null) part += ` = ${currency} ${row.lineTotal}`;
      lines.push(part);
    });
  }

  lines.push('Thank you — please settle when you can.');

  let body = lines.join('\n');
  const maxLen = 1500;
  if (body.length > maxLen) {
    body = `${body.slice(0, maxLen - 20)}...\n[truncated]`;
  }
  return body;
}

/**
 * Send Twilio SMS with udhaar + order details. Does not throw; returns result object.
 *
 * @param {Object} params
 * @param {string} params.toPhone - Recipient (local or E.164)
 * @param {string} params.shopName
 * @param {string} [params.customerName]
 * @param {Object} params.udhaar - { udhaar, paid_amount, status, _id? }
 * @param {Object} [params.order] - { total, subtotal, cash_paid? }
 * @param {Array<{ name: string, quantity: number, unitPrice?: number, lineTotal?: number }>} [params.orderLineItems]
 * @param {string} [params.currency='PKR']
 * @returns {Promise<{ ok: boolean, skipped?: string, sid?: string, error?: string, status?: number }>}
 */
async function sendUdhaarCreatedNotificationSms(params) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    console.warn(
      '[sendUdhaarCreatedNotificationSms] Twilio env missing (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_MESSAGING_SERVICE_SID). SMS skipped.'
    );
    return { ok: false, skipped: 'twilio_not_configured' };
  }

  const { toPhone, shopName, customerName, udhaar, order, orderLineItems, currency } = params;

  const to = normalizePhoneForTwilio(toPhone);
  if (!to) {
    console.warn('[sendUdhaarCreatedNotificationSms] Invalid or empty phone number. SMS skipped.');
    return { ok: false, skipped: 'invalid_phone' };
  }

  const Body = buildUdhaarSmsBody({
    shopName,
    customerName,
    udhaar,
    order,
    orderLineItems,
    currency
  });

  const url = `https://api.twilio.com/${TWILIO_API_VERSION}/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const form = new URLSearchParams();
  form.set('To', to);
  form.set('MessagingServiceSid', messagingServiceSid);
  form.set('Body', Body);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data.message || data.error || res.statusText;
      console.error('[sendUdhaarCreatedNotificationSms] Twilio error:', res.status, errMsg, data);
      return { ok: false, error: errMsg, status: res.status, twilioCode: data.code };
    }

    return { ok: true, sid: data.sid };
  } catch (e) {
    console.error('[sendUdhaarCreatedNotificationSms] Request failed:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  sendUdhaarCreatedNotificationSms,
  normalizePhoneForTwilio,
  buildUdhaarSmsBody
};
