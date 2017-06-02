const ONE_HOUR_IN_MILLISECONDS = 1000 * 60 * 60;

function normalizeSearchInput(text) {
    return text.toLowerCase().trim().replace(/\s{2,}/g, ' ');
}

function getDateNHoursAgo(hours) {
    return new Date(Date.now - (ONE_HOUR_IN_MILLISECONDS * hours));
}

const MONTHS = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

function formatLocalDate(localDate) {
    const date = localDate.getNativeDateLazily();
    return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}

function formatLocalTime(localTime) {
    const hours = Number(localTime.toString().substr(0, 2));
    // Don't cast minutes to a number because we want to keep any preceding zero.
    const minutes = localTime.toString().substr(3, 2);

    let string;

    if (hours === 0 || hours === 24) {
        string = '12:' + minutes + 'am';
    } else if (hours === 12) {
        string = '12:' + minutes + 'pm';
    } else if (hours > 12) {
        string = (hours - 12) + ':' + minutes + 'pm';
    } else {
        // Cast to number to remove preceding zero.
        string = Number(hours) + ':' + minutes + 'am';
    }

    return string.replace(':00', '');
}

module.exports = {
    normalizeSearchInput,
    getDateNHoursAgo,
    formatLocalDate,
    formatLocalTime,
};
