'use strict';

const https = require('https');
const changeCaseKeys = require('change-case-keys');
const queryString = require('querystring');

async function doRequest(method, domain, path, bodyData = null) {
    if (!path.startsWith('/')) {
        throw new Error('Path must start with /');
    }

    console.log(`Slack API request: ${method} ${domain}${path}`);

    return new Promise(function(resolve, reject) {
        const options = {
            hostname: domain,
            path: path,
            method: method,
            headers: {},
        };

        if (method === 'POST' && bodyData) {
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            options.headers['Content-Length'] = Buffer.byteLength(queryString.stringify(bodyData));
        }

        const request = https.request(
            options,
            function(response) {
                let jsonString = '';
                response.on('data', data => jsonString += data);
                response.on('end', () => {
                    if (jsonString) {
                        let json;
                        try {
                            let json = JSON.parse(jsonString);
                        } catch (e) {
                            console.error('Response body is not valid JSON:', jsonString);
                            throw e;
                        }
                        json = changeCaseKeys(json, 'camelize');
                        resolve({statusCode: response.statusCode, json});
                    } else {
                        resolve({statusCode: response.statusCode});
                    }
                });
            })
            .on('error', (error) => {
                reject(error);
            });

        if (method === 'POST' && bodyData) {
            request.write(queryString.stringify(bodyData));
        }

        request.end();
    });
}

async function get(path) {
    return doRequest('GET', 'slack.com', `/api${path}`);
}

async function post(path, data) {
    return doRequest('POST', 'slack.com', `/api${path}`, data);
}

async function postToHookUrl(url, data) {
    // Can't use `post()` because the input must be JSON-encoded instead of www-form-urlencoded,
    // and the response is a string 'ok' instead of JSON.

    const domain = 'hooks.slack.com';
    const path = url.split('https://' + domain)[1];

    console.log(`Slack API request: POST ${domain}${path}`);

    const dataAsString = JSON.stringify(data);

    return new Promise(function(resolve, reject) {
        const options = {
            hostname: domain,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': dataAsString.length,
            },
        };

        const request = https.request(
            options,
            function(response) {
                let responseString = '';
                response.on('data', data => responseString += data);
                response.on('end', () => {
                    if (responseString) {
                        resolve({statusCode: response.statusCode, data: responseString});
                    } else {
                        resolve({statusCode: response.statusCode});
                    }
                });
            })
            .on('error', (error) => {
                reject(error);
            });
        request.write(dataAsString);
        request.end();
    });
}

module.exports = {
    get,
    post,
    postToHookUrl,
};
