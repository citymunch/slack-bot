'use strict';

const mongoose = require('../db');

const MessageInteractionModel = mongoose.model('message_interactions', new mongoose.Schema({}, {strict: false}));

function save(details) {
    (new MessageInteractionModel(details)).save((err) => {
        if (err) {
            console.log('Error saving message interaction:', err, details);
        }
    });
}

module.exports = {
    save,
};
