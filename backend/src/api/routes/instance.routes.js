const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { listInstances, createInstance } = require('../controllers/instance.controller');

router.get('/', asyncHandler(listInstances));
router.post('/', asyncHandler(createInstance));

module.exports = router;
