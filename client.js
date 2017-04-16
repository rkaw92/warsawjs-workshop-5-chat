'use strict';

// ### Dependencies ###

const SocketClient = require('socket.io-client');
const EOL = require('os').EOL;
const util = require('util');
const colors = require('colors/safe');

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
const defaultPrompt = '> ';
cli.setPrompt(defaultPrompt);

const clientStatus = {
  connected: false,
  authenticated: false,
  credentials: null
};

// ### CLI initialization ###

function authenticateClient() {
  socket.emit('auth', clientStatus.credentials);
}

function handleCommandLine(commandLine) {
  const commands = {
    help: function() {
      writeLine(colors.gray('#### Usage ####'));
      writeLine(('To execute commands, type a slash (/) followed by command name.'));
      writeLine('To send a chat message, simply type a line of text without a leading slash.');
      writeLine('Messages from other users are displayed as they come. Note that you will usually need to login in order to participate in chats.');
      writeLine('Available commands:');
      writeLine('/login <login> <password> - set the username/password to be used upon connection and log in');
      writeLine('/register <login> <password> - create a new account on the server');
      writeLine('/quit - close the connection and exit the chat client');
      writeLine(colors.gray('###############'));
    },
    login: function(login, password) {
      clientStatus.credentials = { login, password };
      if (clientStatus.connected) {
        authenticateClient();
      }
    },
    register: function(login, password) {
      socket.emit('register', { login, password });
      clientStatus.credentials = { login, password };
    },
    quit: function() {
      socket.close();
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write('# So long and thanks for all the fish!' + EOL);
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
  if (clientStatus.authenticated) {
    socket.emit('chat', { body: chatLine });
  } else {
    writeLine('# (Message not sent - you are not logged in)');
  }
}

writeLine(colors.gray('# CHAT CLIENT v1'));
writeLine(colors.gray('# - For help, type /help'));
writeLine(colors.yellow('# Connecting to [ %s ]...'), options.URL);
cli.on('line', function handleLine(line) {
  try {
    // Recognize commands:
    if (line[0] === '/') {
      handleCommandLine(line);
    } else if (line.length > 0) {
      handleChatLine(line);
    }
  } catch (error) {
    writeLine('# Error: %s', error.message);
  }
  // After handling each line, prompt the user for next input:
  cli.prompt();
});

// ### Socket logic ###

socket.on('connect', function() {
  clientStatus.connected = true;
  clientStatus.authenticated = false;
  writeLine(colors.yellow('# Connected.'));
  if (clientStatus.credentials) {
    authenticateClient();
  }
});
socket.on('disconnect', function() {
  clientStatus.connected = false;
  clientStatus.authenticated = false;
  cli.setPrompt(defaultPrompt);
  writeLine(colors.yellow('# Disconnected from chat server.'));
});
socket.on('error', function(error) {
  writeLine(colors.red('# Socket error: %s', error));
});
socket.on('chat', function(data) {
  // Special case: if the message came from another connection but from
  //  our login, display this fact to the user:
  if (data.from === clientStatus.credentials.login) {
    writeLine(colors.blue('%s (other connection): ') + '%s', data.from, data.body);
  } else {
    writeLine(colors.blue('%s: ') + '%s', data.from, data.body);
  }
});
socket.on('auth', function({ success, error, login }) {
  if (success) {
    cli.setPrompt(login + ': ');
    clientStatus.authenticated = true;
    writeLine(colors.yellow('# Logged in as %s.'), login);
  } else {
    writeLine(colors.red('# Failed to log in - reason: %s'), error.message);
  }
});
socket.on('register', function({ success, error, login }) {
  if (success) {
    writeLine(colors.yellow('# Registered as %s.'), login);
    if (clientStatus.connected) {
      authenticateClient();
    }
  } else {
    writeLine(colors.red('# Failed to register new user - reason: %s'), error.message);
  }
});
socket.on('join', function({ login }) {
  writeLine(colors.blue('# joins: %s'), login);
});
socket.on('leave', function({ login }) {
  writeLine(colors.blue('# leaves: %s'), login);
});
