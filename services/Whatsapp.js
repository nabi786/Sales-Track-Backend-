const { Client, LocalAuth } = require('whatsapp-web.js');

const clients = {};

/**
 * Get or create WhatsApp client per user
 */
const getWhatsAppClient = async (userId) => {
    if (clients[userId]) {
        return clients[userId];
    }


    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: userId
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', (qr) => {
        console.log(`QR for user ${userId}:`, qr);

        // 🔥 SEND QR TO FRONTEND
        if (global.io) {
            global.io.to(userId).emit('whatsapp_qr', qr);
        }
    });

    client.on('ready', () => {
        console.log(`WhatsApp Ready for user ${userId}`);

        if (global.io) {
            global.io.to(userId).emit('whatsapp_ready');
        }
    });

    client.on('disconnected', (reason) => {
        console.log(`Disconnected user ${userId}`, reason);

        delete clients[userId];

        // notify frontend
        if (global.io) {
            global.io.to(userId).emit('whatsapp_disconnected');
        }
    });

    await client.initialize();

    clients[userId] = client;

    return client;
};



/**
 * Send WhatsApp message safely (non-crashing)
 */
const sendWhatsAppMessage = async (userId, phone, message) => {
    try {
        const client = await getWhatsAppClient(userId);

        if (!phone) return;

        // clean phone
        let cleanPhone = phone.replace(/\D/g, '');

        // convert 03xxxxxxxxx → 923xxxxxxxxx (Pakistan format)
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '92' + cleanPhone.substring(1);
        }

        try {

            console.log('WhatsApp sent to:', cleanPhone);
            console.log('message sent to:', message);
            await client.sendMessage(`${cleanPhone}@c.us`, message);
        } catch (err) {
            console.log('WhatsApp send error:', err.message);
        }

    } catch (err) {
        console.log('WhatsApp client error:', err.message);
    }
};




module.exports = {
    getWhatsAppClient,
    sendWhatsAppMessage,
    clients
};