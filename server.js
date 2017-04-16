'use strict';

// ### Dependencies ###
const http = require('http');
const bunyan = require('bunyan');
const ChatServer = require('./lib/ChatServer');
const authenticators = require('./lib/authenticators');

// ### Server objects ###

const logger = bunyan.createLogger({
  name: 'warsawjs-workshop-5-chat',
  side: 'server',
  level: process.env.LOG_LEVEL || 'info',
  stream: process.stdout,
  serializers: bunyan.stdSerializers
});
const authenticator = new authenticators.LevelAuthenticator();
const httpServer = http.createServer();
const chatServer = new ChatServer({
  logger,
  httpServer,
  authenticator,
  options: {
    HTTP_PORT: process.env.HTTP_PORT,
    HTTP_HOST: process.env.HTTP_HOST
  }
});

// ### Listening ###
chatServer.start().done(function() {
  logger.info({ event: 'server.start' }, 'Chat server started');
});
