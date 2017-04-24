'use strict';

const mongoose = require('../db');

const SearchQueryModel = mongoose.model('search_queries', new mongoose.Schema({}, {strict: false}));

function save(unparsedCriteria, parsedCriteria, userId) {
    const document = {unparsedCriteria, parsedCriteria, userId};
    (new SearchQueryModel(document)).save((err) => {
        if (err) {
            console.log('Error saving search query:', document);
        }
    });
}

function findLatestLocationByUserId(userId) {
    return new Promise(function(resolve, reject) {
        SearchQueryModel.findOne({userId: userId, 'parsedCriteria.location': {$ne: null}})
            .sort({_id: -1})
            .exec(function(err, search) {
                if (err) {
                    reject(err);
                    return;
                }
                if (!search) {
                    resolve(null);
                    return;
                }
                resolve(search.toObject().parsedCriteria.location);
            });
    });
}

module.exports = {
    save,
    findLatestLocationByUserId,
};
