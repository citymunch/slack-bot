const ONE_HOUR_IN_MILLISECONDS = 1000 * 60 * 60;

function normalizeSearchInput(text) {
    return text.toLowerCase().trim().replace(/\s{2,}/g, ' ');
}

function getDateNHoursAgo(hours) {
    return new Date(Date.now - (ONE_HOUR_IN_MILLISECONDS * hours));
}

module.exports = {
    normalizeSearchInput,
    getDateNHoursAgo,
};
