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

/**
 * @return {Promise} Resolves to a location object if a location is found.
 *                   Resolves to null if no location found.
 */
function findLatestLocationByUserId(userId) {
    return SearchQueryModel.findOne({userId: userId, 'parsedCriteria.location': {$ne: null}})
        .sort({_id: -1})
        .then(function (search) {
            if (!search) {
                return null;
            }
            return search.toObject().parsedCriteria.location;
        });
}

module.exports = {
    save,
    findLatestLocationByUserId,
};
