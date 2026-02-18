'use strict';

const express = require('express');
const { protectUniversity } = require('../middleware/universityAuth.middleware');
const { getDashboard } = require('../controllers/universityDashboard.controller');

const router = express.Router();

router.get('/dashboard', protectUniversity, getDashboard);

module.exports = router;
