'use strict';

const when = require('when');

class DummyAuthenticator {
  constructor({ logger }) {
    this._logger = logger.child({ module: 'DummyAuthenticator' });
  }

  authenticate(login, password) {
    this._logger.info({ event: 'authenticate', login: login });
    return when.resolve();
  }
}

module.exports = DummyAuthenticator;
