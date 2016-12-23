'use strict';

const bodyParser = require('body-parser');
const changeCaseKeys = require('change-case-keys');
const config = require('../config/server');
const express = require('express');
const fs = require('fs');
const localDateTime = require('local-date-time');
const searcher = require('./citymunch/searcher');
const slackApi = require('./slack/api');
const slackEvents = require('./slack/events');
const slackResponses = require('./slack/responses');
const slackSlashCommands = require('./slack/slash-commands');
const slackTeams = require('./slack/teams');

const app = express();

const port = config.port;
if (!port || port === 0) {
    throw new Error('No port number given');
}

const database = config.database;
if (!database) {
    throw new Error('No database name given');
}

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

// Convert all inputs to camel-case.
app.use(function(req, res, next) {
    if (typeof req.body === 'object') {
        req.body = changeCaseKeys(req.body, 'camelize');
    }
    next();
});

app.get('/', function(req, res) {
    res.redirect('http://citymunchapp.com/');
});

app.get('/oauth', function(req, res) {
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
    'what time is it?': () => localDateTime.LocalTime.now().toString() + ' UTC',
    'thanks': () => 'You\'re welcome',
    'thank you': () => 'You\'re welcome',
};

function getInChannelPlainTextResponse(text) {
    return {
        response_type: 'in_channel',
        text: text,
        color: 'good',
    };
}

/**
 * Responds to /citymunch.
 */
async function searchAndRespondToSlashCityMunchCommand(query, httpResponse, responseUrl) {
    try {
        const result = await searcher.search(query)
        console.log('Result for query "' + query + '":', result);

        // Respond immediately, instead of using the hook response URL, because delayed responses
        // to the hook URL don't show the original user's "/citymunch [query]" message in the
        // channel.
        const messageResponse = {
            response_type: 'in_channel',
            text: result.message,
            attachments: [
                {
                    title: 'Reserve voucher',
                    title_link: config.urlShortener + '/restaurant/' + result.restaurant.id + '?utm_source=CM&utm_medium=SB&utm_content=TXT&utm_campaign=CB',
                    color: '#38B471',
                },
            ],
        };
        httpResponse.send(messageResponse);

        slackResponses.save({query, text: messageResponse.text, attachments: messageResponse.attachments});
    } catch (error) {
        console.log('Error searching and responding to query:', error);

        httpResponse.send('');

        const messageResponse = {
            response_type: 'ephemeral',
            text: 'We couldn\'t find any offers for that search that are on today',
        };
        slackApi.postToHookUrl(responseUrl, messageResponse);

        slackResponses.save({query, text: messageResponse.text});
    }
}

/**
 * Responds to @citymunch.
 */
async function searchAndRespondToCityMunchMention(query, team, channelId) {
    try {
        const result = await searcher.search(query)
        console.log('Result for query "' + query + '":', result);

        const attachments = [
            {
                title: 'Reserve voucher',
                title_link: config.urlShortener + '/restaurant/' + result.restaurant.id + '?utm_source=CM&utm_medium=SB&utm_content=TXT&utm_campaign=CB',
                color: '#38B471',
            },
        ];

        const response = await slackTeams.postToChannel(
            team,
            channelId,
            result.message,
            attachments
        );
        console.log('Replied in channel:', result.message);

        slackResponses.save({query, text: result.message, attachments: attachments});
    } catch (error) {
        console.log('Error searching and responding to query:', error);

        const message = 'We couldn\'t find any offers for that search that are on today';

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
        searchAndRespondToSlashCityMunchCommand(req.body.text, res, req.body.responseUrl);
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

    // `user` will be set if the event was from a user.
    // `username` and `botId` will be set if the event was from a bot.
    if (event.user) {
        const team = await slackTeams.findTeam(req.body.teamId);

        console.log(`User "${event.user}" said in team ${team.teamName}: ${event.text}`);

        const citymunchBotUserId = team.bot.botUserId;

        const citymunchBotMention = '<@' + citymunchBotUserId + '> ';
        if (event.text.startsWith(citymunchBotMention)) {
            const query = event.text.substring(citymunchBotMention.length).trim();

            if (EASTER_EGGS[query.toLowerCase()]) {
                respondToCityMunchMentionContainingEasterEgg(query, team, event.channel);
            } else {
                searchAndRespondToCityMunchMention(query, team, event.channel);
            }
        }
    } else if (event.botId) {
        console.log(`Bot "${event.username}" said in team ${team.teamName}: ${event.text}`);
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

app.listen(port, function() {
    console.log(`Listening on port ${port}...`);
    console.log(`Using database ${database}...`);
});
