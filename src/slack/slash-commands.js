'use strict';

const mongoose = require('../db');

const SlashCommandModel = mongoose.model('slash_commands', new mongoose.Schema({}, {strict: false}));

function saveUse(details) {
    (new SlashCommandModel(details)).save((err) => {
        if (err) {
            console.log('Error saving slash command use:', err, details);
        }
    });
}

module.exports = {
    saveUse,
};
