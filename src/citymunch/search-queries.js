'use strict';

const mongoose = require('../db');

const SearchQueryModel = mongoose.model('search_queries', new mongoose.Schema({}, {strict: false}));

function save(unparsedCriteria, parsedCriteria, userId) {
    const document = {unparsedCriteria, parsedCriteria, userId, date: new Date()};
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
function findLatestLocationByUserId(userId, since = null) {
    const criteria = {
        userId,
        'parsedCriteria.location': {$ne: null},
    };
    if (since) {
        criteria.date = {$gte: since};
    }

    return SearchQueryModel.findOne(criteria)
        .sort({_id: -1})
        .then(function (search) {
            if (!search) {
                return null;
            }
            return search.toObject().parsedCriteria.location;
        });
}

/**
 * @return {Promise} Resolves to a number.
 */
async function countSearchesByUser(userId) {
    return SearchQueryModel.count({userId});
}

module.exports = {
    save,
    findLatestLocationByUserId,
    countSearchesByUser,
};
