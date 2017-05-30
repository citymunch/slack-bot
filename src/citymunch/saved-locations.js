'use strict';

const mongoose = require('../db');

const SavedLocationModel = mongoose.model('saved_locations', new mongoose.Schema({}, {strict: false}));

const OPTIONS = [
    {name: 'work', saveText: 'If you save this location, you can just type "/citymunch lunch near work" in the future.'},
    {name: 'home', saveText: 'If you save this location, you can just type "/citymunch dinner near home" in the future.'},
];

function save(userId, locationName, locationObject) {
    const document = {userId, locationName, locationObject, date: new Date()};
    (new SavedLocationModel(document)).save((err) => {
        if (err) {
            console.log('Error saving saved location model:', document);
        }
    });
}

/**
 * @return {Promise} Resolves to a boolean.
 */
async function hasUserSaved(locationName, userId) {
    return SavedLocationModel.findOne({userId, locationName})
        .then(result => !!result);
}

/**
 * @return {Promise} Resolves to an object or null.
 */
async function getSavedLocation(locationName, userId) {
    return SavedLocationModel.findOne({userId, locationName})
        .sort({date: -1})
        .then(result => result ? result.toObject() : null);
}

function isOption(name) {
    for (let i = 0; i < OPTIONS.length; i++) {
        if (OPTIONS[i].name === name) {
            return true;
        }
    }
    return false;
}

module.exports = {
    OPTIONS,
    save,
    hasUserSaved,
    getSavedLocation,
    isOption,
};
