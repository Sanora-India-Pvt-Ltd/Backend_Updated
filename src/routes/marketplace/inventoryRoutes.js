const express = require('express');
const { protect } = require('../../middleware/auth');
const sellerGuard = require('../../middleware/sellerGuard');
const {
    createOrUpdateInventory,
    getInventoryByProduct
} = require('../../controllers/marketplace/inventoryController');

const router = express.Router();

router.post('/', protect, sellerGuard, createOrUpdateInventory);
router.get('/:productId', getInventoryByProduct);

module.exports = router;

