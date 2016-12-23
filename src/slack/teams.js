'use strict';

const mongoose = require('../db');
const slackApi = require('./api');

const TeamModel = mongoose.model('teams', new mongoose.Schema({}, {strict: false}));

function saveTeam(details) {
    (new TeamModel(details)).save((err) => {
        if (err) {
            console.log('Error saving team:', err, details);
        }
    });
}

/**
 * @return {Promise}
 */
async function findTeam(id) {
    return new Promise(function(resolve, reject) {
        TeamModel.findOne({teamId: id}, function(err, team) {
            if (err) {
                reject(err);
                return;
            }
            if (!team) {
                reject('No team found with ID: ' + id);
                return;
            }
            resolve(team.toObject());
        });
    });
}

/**
 * @return {Promise}
 */
async function postToChannel(team, channelId, message, attachments = []) {
    const options = {
        token: team.accessToken,
        channel: channelId,
        text: message,
        fallback: message,
        link_names: false,
    };

    if (attachments.length > 0) {
        // `attachments` must be a string of JSON -- see https://github.com/slackapi/node-slack-sdk/issues/12
        options.attachments = JSON.stringify(attachments);
    }

    return slackApi.post('/chat.postMessage', options);
}

module.exports = {
    saveTeam,
    findTeam,
    postToChannel,
};
