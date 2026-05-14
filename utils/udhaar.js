const Udhaar = require('../models/Udhaar');
const mongoose = require('mongoose');


const getPendingUdhaarByCustomer = async (customerId) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(customerId)) {
            throw new Error("Invalid customer ID");
        }

        const result = await Udhaar.aggregate([
            {
                $match: {
                    customer_id: new mongoose.Types.ObjectId(customerId),
                    status: "pending",
                    udhaar: { $gt: 0 }
                }
            },
            {
                $project: {
                    pendingAmount: {
                        $subtract: [
                            { $ifNull: ["$udhaar", 0] },
                            { $ifNull: ["$paid_amount", 0] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: "$customer_id",
                    totalPendingUdhaar: { $sum: "$pendingAmount" }
                }
            }
        ]);

        return result.length > 0 ? result[0].totalPendingUdhaar : 0;

    } catch (error) {
        console.error("getPendingUdhaarByCustomer error:", error);
        return 0;
    }
};

module.exports = {
    getPendingUdhaarByCustomer
};
