const mongoose = require('../../src/db');
const notifications = require('../../src/citymunch/daily-notifications');

after(() => {
    mongoose.disconnect(() => {
        mongoose.models = {};
    });
});

const AMY_BOYD_USER_ID_IN_SLACK = 'U1WUJHB3K';

describe('Daily notifications', () => {
    describe('sendDirectMessageToUser()', () => {
        it('should successfully send and record the response in the database', (done) => {
            notifications.sendDirectMessageToUser(AMY_BOYD_USER_ID_IN_SLACK, 'Test message')
                .then(() => done())
                .catch(() => done(new Error()));
        });
    });

    describe('promptToEnableNotifications()', () => {
        it('should successfully send a prompt', (done) => {
            notifications.promptToEnableNotifications(AMY_BOYD_USER_ID_IN_SLACK)
                .then(() => done())
                .catch(() => done(new Error()));
        });
    });
});
