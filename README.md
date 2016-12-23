CityMunch Slack bot server
==========================

Installation:

```
npm install
cp config/server.js.example config/server.js # Then edit the file.
```

To start the server:

```
npm start
```

## Development

To run the tests:

```
npm test
```

Set up the Git pre-commit hook to prevent committing some mistakes:

```
ln -s ../../bin/pre-commit .git/hooks/pre-commit
```
