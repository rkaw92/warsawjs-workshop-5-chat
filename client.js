'use strict';

// ### Dependencies ###

const SocketClient = require('socket.io-client');
const EOL = require('os').EOL;
const util = require('util');

// ### Helper functions ###

function writeLine(line, ...args) {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(util.format(line, ...args) + EOL);
  cli.prompt(true);
}

// ### Settings ###
const options = {
  URL: process.env.URL || 'http://localhost:3000'
};

// ### Client objects ###
const socket = SocketClient.connect(options.URL, {
  transports: [ 'websocket' ]
});
const cli = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
cli.setPrompt('> ');

const clientStatus = {
  connected: false,
  authenticated: true,
  credentials: null
};

// ### CLI initialization ###

function authenticateClient() {
  socket.emit('auth', clientStatus.credentials);
}

function handleCommandLine(commandLine) {
  const commands = {
    login: function(login, password) {
      clientStatus.credentials = { login, password };
      if (clientStatus.connected) {
        authenticateClient();
      }
    },
    quit: function() {
      socket.close();
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write('# Goodbye and thanks for using CHAT!' + EOL);
      process.exit();
    }
  };
  const parts = commandLine.slice(1).split(' ');
  const commandName = parts[0];
  const commandArgs = parts.slice(1);
  if (commands[commandName]) {
    commands[commandName].apply(undefined, commandArgs);
  } else {
    throw new Error('Unknown command: ' + commandName);
  }
}

function handleChatLine(chatLine) {
  socket.emit('chat', { body: chatLine });
}

writeLine('# CHAT CLIENT v1');
writeLine('# - For help, type /help');
writeLine('# Connecting to [ %s ]...', options.URL);
cli.on('line', function handleLine(line) {
  try {
    // Recognize commands:
    if (line[0] === '/') {
      handleCommandLine(line);
    } else {
      handleChatLine(line);
    }
  } catch (error) {
    writeLine('# Error: %s', error.message);
  }
  cli.prompt();
});

// ### Socket logic ###

socket.on('connect', function() {
  clientStatus.connected = true;
  writeLine('# Connected.');
  if (clientStatus.credentials) {
    authenticateClient();
  }
});
socket.on('disconnect', function() {
  clientStatus.connected = false;
  writeLine('# Disconnected from chat server.');
});
socket.on('error', function(error) {
  writeLine('# Socket error: %s', error);
});
socket.on('chat', function(data) {
  writeLine('%s: %s', data.from, data.body);
});
socket.on('auth', function({ success, error, login }) {
  if (success) {
    writeLine('# Logged in as %s.', login);
  } else {
    writeLine('# Failed to log in - reason: %s', error.message);
  }
});
socket.on('join', function({ login }) {
  writeLine('# joins: %s', login);
});
socket.on('leave', function({ login }) {
  writeLine('# leaves: %s', login);
});
