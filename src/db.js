'use strict';

const config = require('../config/server');

const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1/' + config.database);

module.exports = mongoose;
