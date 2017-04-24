CityMunch Slack bot server
==========================

This is the CityMunch slack bot. Find lunch or dinner near you in your Slack channel, with a search like `/citymunch pizza in London` or `/citymunch bristol`.

To install this into your Slack channel, [click here](https://slackbot.citymunchapp.com/install).

Want to use CityMunch's deals in an app of your own? Check out our [partner program](https://partners.citymunchapp.com)!

Development
-----------

Installation:

```
npm install
cp config/server.js.example config/server.js # Then edit the file.
```

To start the server:

```
npm start
```

To run the tests:

```
npm test
```

Set up the Git pre-commit hook to prevent committing some mistakes:

```
ln -s ../../bin/pre-commit .git/hooks/pre-commit
```
