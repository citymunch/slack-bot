'use strict';

process.env.TZ = 'Europe/London';

const dailyNotifications = require('./citymunch/daily-notifications');
const searchQueries = require('./citymunch/search-queries');
const searcher = require('./citymunch/searcher');
const slackResponses = require('./slack/responses');
const slackTeams = require('./slack/teams');
const LocalTime = require('local-date-time').LocalTime;

async function doNotifications() {
    const users = await dailyNotifications.findUsersWithDailyNotificationsEnabled();

    for (let i = 0; i < users.length; i++) {
        const userId = users[i];
        console.log('Doing daily notifications for user ' + userId);

        const lastLocation = await searchQueries.findLatestLocationByUserId(userId);

        const criteria = searcher.createEmptyParseResult();
        criteria.location = lastLocation;
        criteria.startTime = LocalTime.of('12:00');
        criteria.endTime = LocalTime.of('14:30');

        const team = await slackTeams.findTeamWithUser(userId);
        const teamId = team ? team.teamId : null;

        console.log('Team ID is ' + teamId);

        const result = await searcher.searchByCriteria(criteria, teamId);

        const attachments = [];

        if (result.addShowMoreButton) {
            attachments.push({
                // These empty strings are needed -- otherwise Slack won't show the action
                // buttons sent to a delayed response URL.
                text: '',
                fallback: '',
                callback_id: 'search_result_' + result.searchId,
                color: '#38b471',
                attachment_type: 'default',
                actions: [{
                    name: 'show_more',
                    text: 'Show more',
                    type: 'button',
                    value: 'more',
                }],
            });
        }

        attachments.push({
            // These empty strings are needed -- otherwise Slack won't show the action
            // buttons sent to a delayed response URL.
            text: '',
            fallback: '',
            callback_id: 'disable_daily_notifications',
            color: '#38b471',
            attachment_type: 'default',
            actions: [{
                type: 'button',
                name: 'disable_daily_notifications',
                text: 'Disable notifications',
            }],
        });

        await dailyNotifications.sendDirectMessageToUser(userId, result.message, attachments);

        await slackResponses.save({dailyNotificationCriteria: criteria, text: result.message, searchResult: result, isDailyNotification: true});

        console.log('Sent daily notifications to user ' + userId, result.message);
    }
}

doNotifications().then(() => process.exit());
