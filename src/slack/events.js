'use strict';

const mongoose = require('../db');

const EventModel = mongoose.model('events', new mongoose.Schema({}, {strict: false}));

function save(details) {
    (new EventModel(details)).save((err) => {
        if (err) {
            console.log('Error saving event:', err, details);
        }
    });
}

/**
 * @return {Promise} Resolves to an object if found. Rejects otherwise.
 */
async function findOne(query) {
    const event = await EventModel.findOne(query);
    if (!event) {
        throw new Error('Event not found by query');
    }
    return event.toObject();
}

module.exports = {
    save,
    findOne,
};
