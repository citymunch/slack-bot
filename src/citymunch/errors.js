'use strict';

function UserNeedsToSayWhereTheyAreError(message) {
    this.name = 'UserNeedsToSayWhereTheyAreError';
    this.message = (message || '');
}
UserNeedsToSayWhereTheyAreError.prototype = new Error();

module.exports = {
    UserNeedsToSayWhereTheyAreError,
};
