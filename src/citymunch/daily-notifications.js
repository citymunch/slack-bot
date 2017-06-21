'use strict';

const mongoose = require('../db');
const searchQueries = require('./search-queries');
const slackApi = require('../slack/api');
const teams = require('../slack/teams');

const DailyNotificationModel = mongoose.model('daily_notifications', new mongoose.Schema({}, {strict: false}));
const DirectMessageModel = mongoose.model('direct_messages', new mongoose.Schema({}, {strict: false}));

async function sendDirectMessageToUser(userId, message, attachments = []) {
    const team = await teams.findTeamWithUser(userId);
    if (!team) {
        console.log('Could not find team for user', userId);
        return;
    }

    const response = await slackApi.post('/chat.postMessage', {
        token: team.bot.botAccessToken,
        channel: userId,
        text: message,
        attachments: JSON.stringify(attachments),
        parse: 'full',
        link_names: false,
        unfurl_links: false,
        unfurl_media: false,
    });

    if (response.statusCode !== 200) {
        throw new Error('Error sending direct message to user ' + userId + ': ' + message);
    }

    const document = {userId, message, response: response.json, date: new Date()};
    (new DirectMessageModel(document)).save((err) => {
        if (err) {
            console.log('Error saving direct message:', document);
        }
    });

    console.log('Sent direct message to user ' + userId + ': ' + message);
}

/**
 * @return {Promise} Resolves to a boolean.
 */
async function hasNotificationsEnabled(userId) {
    return DailyNotificationModel.count({userId, status: 'ENABLED'}) > 0;
}

/**
 * @return {Promise} Resolves to a boolean.
 */
async function hasNotificationsDisabled(userId) {
    return DailyNotificationModel.count({userId, status: 'DISABLED'}) > 0;
}

async function promptToEnableNotifications(userId) {
    return sendDirectMessageToUser(
        userId,
        'Want to nab the best lunch offers before anyone else? Get daily notifications from CityMunch via Slack.',
        [{
            text: '',
            callback_id: 'enable_daily_notifications',
            color: '#38b471',
            actions: [{
                type: 'button',
                name: 'enable_daily_notifications',
                text: 'Enable notifications',
            }],
        }]
    );
}

async function checkIfUserShouldBePromptedToGetDailyNotifications(userId) {
    const queries = await searchQueries.countSearchesByUser(userId);
    if (queries !== 3 && queries !== 20) {
        // Only prompt repeat users -- those who have done 3 or more searches.
        return;
    }

    const location = await searchQueries.findLatestLocationByUserId(userId);
    if (!location) {
        return;
    }

    const alreadyEnabled = await hasNotificationsEnabled(userId);
    const alreadyDisabled = await hasNotificationsDisabled(userId);
    if (!alreadyEnabled && !alreadyDisabled) {
        promptToEnableNotifications(userId);
    }
}

async function enableDailyNotifications(userId) {
    const document = {userId, status: 'ENABLED', enabledAt: new Date()};
    (new DailyNotificationModel(document)).save((err) => {
        if (err) {
            console.log('Error enabling daily notifications:', document);
        }
    });
}

async function disableDailyNotifications(userId) {
    DailyNotificationModel.update(
        {userId, status: 'ENABLED'},
        {$set: {status: 'DISABLED', disabledAt: new Date()}}
    );
    console.log('Error disabling daily notifications:', document);
}

module.exports = {
    checkIfUserShouldBePromptedToGetDailyNotifications,
    enableDailyNotifications,
    disableDailyNotifications,
    // Exported only for tests:
    sendDirectMessageToUser,
    promptToEnableNotifications,
};
