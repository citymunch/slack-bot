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

module.exports = {
    save,
};
