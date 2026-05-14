const express = require('express');
const router = express.Router();
const { getAllUsers, createUser, deactivateUser, updateUser } = require('../../controllers/adminController');

router.get('/', getAllUsers);
router.post('/', createUser);
router.put('/:id/deactivate', deactivateUser);
router.put('/:id', updateUser);

module.exports = router;
