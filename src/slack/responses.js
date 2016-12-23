'use strict';

const mongoose = require('../db');

const ResponseModel = mongoose.model('responses', new mongoose.Schema({}, {strict: false}));

function save(details) {
    (new ResponseModel(details)).save((err) => {
        if (err) {
            console.log('Error saving response:', err, details);
        }
    });
}

module.exports = {
    save,
};
