'use strict';

const level = require('level');
const levelPromisify = require('level-promisify');
const path = require('path');
const bcrypt = require('bcrypt-as-promised');
const when = require('when');

class LevelAuthenticator {
  constructor({ options = {} } = {}) {
    this._options = {
      // The path to the DB file:
      path: options.path || path.join(__dirname, '../../auth.db'),
      // bcrypt cost factor (exponent):
      costFactor: options.costFactor || 12
    };
    this._db = levelPromisify(level(this._options.path));
    // Prepare a Promise-based write lock to avoid race conditions:
    this._registrationLock = when.resolve();
  }

  register(login, password) {
    const self = this;
    // Wait for whatever may be running at the moment:
    this._registrationLock = this._registrationLock.then(function() {
      // Find out if the user already exists:
      return when.all([
        bcrypt.hash(password, self._options.costFactor),
        self._db.get(LevelAuthenticator.userPrefix + login).then(function keyExists() {
          throw new Error('User already exists');
        }, function(error) {
          // "not found" is what we are hoping for - the user should not exist.
          if (error.type === 'NotFoundError') {
            return;
          }
          // This is not our expected error. Re-throw it.
          throw error;
        })
      ]).then(function([ passwordHash ]) {
        return self._db.put(LevelAuthenticator.userPrefix + login, passwordHash);
      });
    });
    return this._registrationLock;
  }

  authenticate(login, password) {
    // Since authenticating is not a write operation, it skips the lock:
    return this._db.get(LevelAuthenticator.userPrefix + login).then(function(passwordHash) {
      return bcrypt.compare(password, passwordHash).catch(bcrypt.MISMATCH_ERROR, function(error) {
        throw new Error('Password invalid');
      });
    });
  }
}
LevelAuthenticator.userPrefix = 'users:';

module.exports = LevelAuthenticator;
