'use strict';

const mongoose = require('../db');
const shortId = require('shorter-mongo-id');
const config = require('../../config/server');
const ClickThroughUrlModel = mongoose.model(
    'click_through_urls',
    new mongoose.Schema({_id: {type: String}}, {strict: false})
);

/**
 * Gets a URL that behind-the-scenes includes the restaurant ID and team ID, so we can see what
 * restaurants are working best in the Slack bot v.s. other sources like the mobile app.
 */
async function getRestaurantUrl(restaurantId, teamId) {
    const document = new ClickThroughUrlModel({
        _id: shortId(new mongoose.Types.ObjectId()),
        restaurantId,
        teamId,
        clickThroughs: 0,
        createdAt: new Date(),
    });
    const saved = await document.save();
    return `${config.slackBotHost}/c/${saved._id}`;
}

async function findById(id) {
    return ClickThroughUrlModel.findOne({_id: id})
        .then(function (record) {
            return record.toObject();
        });
}

function incrementClickThroughs(id, userAgent, ipAddress) {
    const update = {
        $inc: {clickThroughs: 1},
        $currentDate: {lastClickedAt: true},
        $addToSet: {clicks: {date: new Date(), ipAddress, userAgent}},
    };

    ClickThroughUrlModel
        .update({_id: id}, update)
        .then(() => {
            console.log('Recorded click-through for link ' + id + ', IP is ' + ipAddress + ', user agent is ' + userAgent);
        })
        .catch(err => {
            console.log('Error recording click-through for link ' + id, err);
        });
}

module.exports = {
    getRestaurantUrl,
    findById,
    incrementClickThroughs,
};
