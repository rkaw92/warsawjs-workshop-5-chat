'use strict';

const level = require('level');
const levelPromisify = require('level-promisify');
const path = require('path');

class LevelAuthenticator {
  constructor({ options = {} }) {
    this._options = {
      path: options.path || path.join(__dirname, '../auth.db')
    };
    this._db = levelPromisify(level(this._options.path));
  }

  addUser(login, password) {

  }

  checkPassword(login, password) {

  }
}
