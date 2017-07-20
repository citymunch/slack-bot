const bodyParser = require('body-parser');
const changeCaseKeys = require('change-case-keys');
const config = require('../config/server');
const express = require('express');
const fs = require('fs');
const localDateTime = require('local-date-time');
const searcher = require('./citymunch/searcher');
const slackApi = require('./slack/api');
const slackEvents = require('./slack/events');
const slackMessageInteractions = require('./slack/message-interactions');
const slackResponses = require('./slack/responses');
const slackSlashCommands = require('./slack/slash-commands');
const slackTeams = require('./slack/teams');
const errors = require('./citymunch/errors');
const savedLocations = require('./citymunch/saved-locations');
const dailyNotifications = require('./citymunch/daily-notifications');
const clickThroughUrls = require('./citymunch/click-through-urls');

const app = express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

function convertObjectKeysFromSlackStyleToCityMunchStyle(object) {
    return changeCaseKeys(object, 'camelize');
}

// Convert all inputs to camel-case.
app.use(function(req, res, next) {
    if (typeof req.body === 'object') {
        req.body = convertObjectKeysFromSlackStyleToCityMunchStyle(req.body);
    }
    next();
});

app.get('/', function(req, res) {
    res.redirect('http://citymunchapp.com/');
});

app.get('/oauth', function(req, res) {
    console.log('Got OAuth install request', req.query);

    const code = req.query.code;

    slackApi.get(`/oauth.access?client_id=${config.slackClientId}&client_secret=${config.slackClientSecret}&code=${code}`)
        .then(response => {
            if (response.statusCode !== 200 || response.json.error) {
                console.error('Error getting OAuth token', response);
                res.status(500).send('There was a problem authorising our app within your Slack. Please try again.');
                return;
            }

            res.redirect('/successfully-installed');

            slackTeams.saveTeam(response.json);
        })
        .catch(error => {
            console.error('Error getting OAuth token', error);
            res.status(500).send('There was a problem authorising our app within your Slack. Please try again.');
        });
});

function getHelpResponse() {
    return {
        response_type: 'ephemeral',
        text: 'Try something like "/citymunch italian around old st" or "/citymunch thali cafe in bristol", or just "/citymunch (your postcode)"',
        color: 'danger',
    };
}

const EASTER_EGGS = {
    'make me a sandwich': () => 'Make one yourself!',
    'are you a dog or cat person?': () => 'I like rabbits! Also, not a person, I\'m a robot!',
    'what time is it?': () => localDateTime.LocalTime.now().toString(),
    'thanks': () => 'You\'re welcome',
    'thank you': () => 'You\'re welcome',
    'i\'m hungry': () => 'Then check the app!',
};

function getInChannelPlainTextResponse(text) {
    return {
        response_type: 'in_channel',
        text: text,
        color: 'good',
    };
}

function getUserFriendlyErrorMessage(error, query) {
    if (error && error.message.startsWith('Could not geocode')) {
        return 'We couldn\'t understand the location part of your search (' + query + '). Try another location?';
    } else {
        return 'We couldn\'t find any offers for that search (' + query + ') that are on today. Try another search like "/citymunch London" or "/citymunch Bristol"?';
    }
}

/**
 * Responds to /citymunch.
 */
async function searchAndRespondToSlashCityMunchCommand(query, httpResponse, responseUrl, userId, teamId) {
    if (query.trim() === '') {
        console.log('Empty query given');
        httpResponse.send('');
        slackApi.postToHookUrl(responseUrl, {
            response_type: 'ephemeral',
            text: 'Where are you? Reply with "/citymunch (your postcode or street name)"',
        });
        return;
    }

    try {
        const result = await searcher.search(query, userId, teamId);

        const messageResponse = {
            response_type: 'in_channel',
            text: result.message,
            attachments: [
                {
                    // These empty strings are needed -- otherwise Slack won't show the action
                    // buttons sent to a delayed response URL.
                    text: '',
                    fallback: '',
                    callback_id: 'search_result_' + result.searchId,
                    color: '#38b471',
                    attachment_type: 'default',
                    actions: [],
                },
            ],
        };

        if (result.addShowMoreButton) {
            messageResponse.attachments[0].actions.push({
                name: 'show_more',
                text: 'Show more',
                type: 'button',
                value: 'more',
            });
        }

        for (let i = 0; i < savedLocations.OPTIONS.length; i++) {
            const option = savedLocations.OPTIONS[i];
            if (result.parsedCriteria.location && ! await savedLocations.hasUserSaved(option.name, userId)) {
                messageResponse.attachments[0].actions.push({
                    name: 'save_location',
                    text: `Save as "${option.name}"`,
                    type: 'button',
                    value: option.name,
                    confirm: {
                        title: `Save "${result.parsedCriteria.location.name}" as "${option.name}"?`,
                        text: option.saveText,
                        ok_text: 'Save',
                        dismiss_text: 'Cancel',
                    },
                });
            }
        }

        httpResponse.send({response_type: 'in_channel'});
        slackApi.postToHookUrl(responseUrl, messageResponse);
        slackResponses.save({query, text: messageResponse.text, searchResult: result});

        if (result.parsedCriteria.location) {
            dailyNotifications.checkIfUserShouldBePromptedToGetDailyNotifications(userId);
        }
    } catch (error) {
        console.log('Error searching and responding to query:', error);

        httpResponse.send('');

        let message;
        if (error instanceof errors.UserNeedsToSayWhereTheyAreError) {
            message = 'Where are you? Reply with "/citymunch (your postcode or street name)"';
        } else {
            message = getUserFriendlyErrorMessage(error, query);
        }

        const messageResponse = {
            response_type: 'ephemeral',
            text: message,
        };
        slackApi.postToHookUrl(responseUrl, messageResponse);

        slackResponses.save({query, text: messageResponse.text});
    }
}

/**
 * Responds to @citymunch.
 */
async function searchAndRespondToCityMunchMention(query, team, channelId, userId, teamId) {
    try {
        const result = await searcher.search(query, userId, teamId);

        await slackTeams.postToChannel(team, channelId, result.message);
        console.log('Replied in channel:', result.message);

        slackResponses.save({query, text: result.message});
    } catch (error) {
        console.log('Error searching and responding to query:', error);

        const message = getUserFriendlyErrorMessage(error, query);

        slackTeams.postToChannel(team, channelId, message);

        slackResponses.save({query, text: message});
    }
}

/**
 * Responds to @citymunch.
 */
async function respondToCityMunchMentionContainingEasterEgg(query, team, channelId) {
    const response = EASTER_EGGS[query.toLowerCase()]();

    slackTeams.postToChannel(team, channelId, response);

    console.log('Replied in channel:', response);

    slackResponses.save({query, text: response});
}

async function handleSlashCitymunch(req, res) {
    const team = await slackTeams.findTeam(req.body.teamId);

    console.log(`${req.body.userName} used /citymunch in team ${team.teamName}: ${req.body.text}`);

    if (req.body.text === 'help') {
        res.send(getHelpResponse());
    } else if (EASTER_EGGS[req.body.text.toLowerCase()]) {
        const text = EASTER_EGGS[req.body.text.toLowerCase()]();
        res.send(getInChannelPlainTextResponse(text));
    } else {
        searchAndRespondToSlashCityMunchCommand(req.body.text, res, req.body.responseUrl, req.body.userId, req.body.teamId);
    }

    slackSlashCommands.saveUse(req.body);
}

app.post('/slash/citymunch', function(req, res) {
    try {
        handleSlashCitymunch(req, res);
    } catch (e) {
        console.error('Error handling /citymunch command', e);
    }
});

async function handleMessageEvent(req) {
    const event = req.body.event;

    const team = await slackTeams.findTeam(req.body.teamId);

    // `user` will be set if the event was from a user.
    // `username` and `botId` will be set if the event was from a bot.
    if (event.user) {
        console.log(`User "${event.user}" said in team ${team.teamName}: ${event.text}`);

        const citymunchBotUserId = team.bot.botUserId;

        const citymunchBotMention = '<@' + citymunchBotUserId + '> ';
        if (event.text.startsWith(citymunchBotMention)) {
            const query = event.text.substring(citymunchBotMention.length).trim();

            if (EASTER_EGGS[query.toLowerCase()]) {
                respondToCityMunchMentionContainingEasterEgg(query, team, event.channel);
            } else {
                searchAndRespondToCityMunchMention(query, team, event.channel, event.user);
            }
        }
    } else if (event.botId) {
        // Ignore our own bot talking -- we already know what we've said.
        if (event.username !== 'CityMunch' && event.text.indexOf('% off at ') === -1) {
            console.log(`Bot "${event.username}" said in team ${team.teamName}: ${event.text}`);
        }
    }
}

app.post('/events', function(req, res) {
    res.send('');

    if (req.body.event.type === 'message') {
        try {
            handleMessageEvent(req);
        } catch (e) {
            console.error('Error handling message event', e);
        }
    }

    slackEvents.save(req.body);
});

async function handleMessageInteraction(payload, res) {
    console.log('Message interaction payload:', payload);

    slackMessageInteractions.save(payload);

    if (payload.callbackId.startsWith('search_result_')) {
        const searchId = payload.callbackId.replace('search_result_', '');
        const previousResponse = await slackResponses.findOneBySearchId(searchId);
        if (!previousResponse) {
            res.send('');
            console.error('Previous message not found with search ID', searchId);
            return;
        }

        const action = payload.actions[0].name;

        if (action === 'show_more') {
            res.send(previousResponse.searchResult.message + '\n' + previousResponse.searchResult.messageAfterShowingMore);
            console.log('Expanded previous message with search ID', searchId);
        } else if (action === 'save_location') {
            const locationName = payload.actions[0].value;
            savedLocations.save(payload.user.id, locationName, previousResponse.searchResult.parsedCriteria.location);
            res.send('');
            console.log('Saved location for user', {
                locationName,
                locationObject: previousResponse.searchResult.parsedCriteria.location,
                user: payload.user,
            });
        } else {
            res.send('');
            console.log('Unexpected message interaction', {action: action, searchId});
        }
    } else if (payload.callbackId === 'enable_daily_notifications') {
        dailyNotifications.enableDailyNotifications(payload.user.id);
        dailyNotifications.sendDirectMessageToUser(payload.user.id, 'Smart move. We\'ll deliver the goods at 11am, every weekday!');
        res.send('');
    } else if (payload.callbackId === 'disable_daily_notifications') {
        dailyNotifications.disableDailyNotifications(payload.user.id);
        dailyNotifications.sendDirectMessageToUser(payload.user.id, 'You\'ll regret that.', [
            {
                text: '',
                fallback: '',
                image_url: 'https://slackbot.citymunchapp.com/static/go-away.gif',
            }
        ]);
        res.send('');
    } else {
        res.send('');
        console.error('Unexpected callback ID', payload.callbackId);
    }
}

app.post('/message-interactions', function(req, res) {
    let payload = JSON.parse(req.body.payload);
    payload = convertObjectKeysFromSlackStyleToCityMunchStyle(payload);
    handleMessageInteraction(payload, res);
});

app.get('/install', function(req, res) {
    fs.readFile('static/add-to-slack-button.html', (err, html) => {
        res.type('html');
        res.send(html);
    });
});

app.get('/successfully-installed', function(req, res) {
    fs.readFile('static/successfully-installed.html', (err, html) => {
        res.type('html');
        res.send(html);
    });
});

app.get('/static/go-away.gif', function(req, res) {
    fs.readFile('static/go-away.gif', (err, image) => {
        res.type('image/gif');
        res.send(image);
    });
});

async function handleClickThrough(req, res) {
    const linkId = req.params.linkId;

    const record = await clickThroughUrls.findById(linkId);
    if (!record) {
        res.redirect('http://citymunchapp.com/');
        return;
    }

    const target = `${config.urlShortener}/slack/${record.restaurantId}`;
    res.redirect(target);

    const userAgent = req.headers['user-agent'];
    const isBot = userAgent.indexOf('https://api.slack.com/robots') !== -1;

    if (!isBot) {
        console.log('Redirecting click-through to:', target);
    }

    if (!isBot) {
        const ipAddress = req.headers['x-real-ip'];
        clickThroughUrls.incrementClickThroughs(linkId, userAgent, ipAddress);
    }
}

app.get('/c/:linkId', function(req, res) {
    handleClickThrough(req, res);
});

module.exports = {
    start() {
        app.listen(config.port, function() {
            console.log(`Listening on port ${config.port}...`);
            console.log(`Using database ${config.database}...`);
        });
    },
};
