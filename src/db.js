'use strict';

const config = require('../config/server');

const mongoose = require('mongoose');

mongoose.Promise = Promise;

const target = 'mongodb://127.0.0.1/' + config.database;

console.log('Starting MongoDB connection to ' + target);

mongoose.connect(target);

module.exports = mongoose;
