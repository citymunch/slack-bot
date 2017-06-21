'use strict';

const mongoose = require('../db');

const ResponseModel = mongoose.model('responses', new mongoose.Schema({}, {strict: false}));

async function save(details) {
    return (new ResponseModel(details)).save((err) => {
        if (err) {
            console.log('Error saving response:', err, details);
        }
    });
}

async function findOneBySearchId(id) {
    return ResponseModel.findOne({'searchResult.searchId': id})
        .then(response => {
            if (!response) {
                return null;
            }
            return response.toObject();
        });
}

module.exports = {
    save,
    findOneBySearchId,
};
