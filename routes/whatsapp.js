const express = require('express');
const router = express.Router();
const { getWhatsAppClient, clients } = require('../services/Whatsapp');
const { authenticate } = require('../middleware/auth');



// All routes require authentication
router.use(authenticate);
router.post('/connect', async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required"
            });
        }

        await getWhatsAppClient(userId);

        return res.json({
            success: true,
            message: "WhatsApp session starting..."
        });

    } catch (error) {
        console.log("WhatsApp connect error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to start WhatsApp"
        });
    }
});


router.post('/disconnect', async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required"
            });
        }

        const client = clients[userId];

        // no active session
        if (!client) {
            return res.status(404).json({
                success: false,
                message: "WhatsApp session not found"
            });
        }

        // logout whatsapp
        await client.logout();

        // destroy client
        await client.destroy();

        // remove from memory
        delete clients[userId];

        return res.json({
            success: true,
            message: "WhatsApp disconnected successfully"
        });

    } catch (error) {
        console.log("WhatsApp disconnect error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to disconnect WhatsApp"
        });
    }
});


router.get('/status', async (req, res) => {
    try {
        const userId = req.user._id;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required"
            });
        }

        const client = clients[userId];

        // no client in memory
        if (!client) {
            return res.json({
                success: true,
                connected: false
            });
        }

        // client exists and ready
        if (client.info) {
            return res.json({
                success: true,
                connected: true,
                phone: client.info.wid.user
            });
        }

        // still initializing
        return res.json({
            success: true,
            connected: false
        });

    } catch (error) {
        console.log("WhatsApp status error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get WhatsApp status"
        });
    }
});

module.exports = router;