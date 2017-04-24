'use strict';

process.env.TZ = 'Europe/London';

const config = require('../config/server');
const httpServer = require('./http-server');

if (!config.port || config.port === 0) {
    throw new Error('No port number given');
}

if (!config.database) {
    throw new Error('No database name given');
}

httpServer.start();
