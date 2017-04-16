'use strict';

const defaults = require('./defaults');
const when = require('when');
const SocketServer = require('socket.io');
// The symbol to be used as property for attaching state to client requests:
const CLIENT_DATA = Symbol('CLIENT_DATA');

// Default socket filter for broadcasts - all sockets get the message:
function allSockets(recipientSocket) {
  return true;
}

/**
 * The Chat Server implements a simple instant messaging solution where users
 *  can exchange short text messages between one another.
 * It supports user authentication and identification.
 */
class ChatServer {
  constructor({ logger, httpServer, authenticator, options = {} }) {
    this._options = options;
    // Assign dependencies to "private" properties:
    this._logger = logger.child({ module: 'ChatServer' });
    this._httpServer = httpServer;
    this._authenticator = authenticator;
    this._app = new SocketServer(httpServer, {
      transports: [ 'websocket' ]
    });

    // Initialize variables for client state-keeping:
    this._userSockets = new Map();
    this._installSocketHandlers();
  }

  _unregisterSocket(socket) {
    const login = socket[CLIENT_DATA].login;
    // If the socket has no login assigned (the client is unauthenticated),
    //  it surely has not been registered, so there is nothing to clean up.
    if (!login) {
      return;
    }
    // Get the Set of sockets currently associated with this login:
    const loginSockets = this._userSockets.get(login) || new Set();
    // Remove our socket if it is there at all:
    loginSockets.delete(socket);
    // If any sockets are left after our operation, put them in our map:
    if (loginSockets.size > 0) {
      this._userSockets.set(login, loginSockets);
    } else {
      // No sockets left - clean up:
      this._userSockets.delete(login);
    }
  }

  _registerSocket(socket) {
    const login = socket[CLIENT_DATA].login;
    // Get existing sockets for this login or create a new Set if none:
    const loginSockets = this._userSockets.get(login) || new Set();
    const originalCount = loginSockets.size;
    // Add our socket:
    loginSockets.add(socket);
    // Write the set back to the map:
    this._userSockets.set(login, loginSockets);
  }

  _notifyUserJoin(login) {
    // Send a "join" message to all sockets of other users:
    this._broadcastMessage('join', { login }, {
      socketFilter: (socket) => (socket[CLIENT_DATA].login !== login)
    });
  }

  _notifyUserLeave(login) {
    // Send a "join" message to all sockets of other users:
    this._broadcastMessage('leave', { login }, {
      socketFilter: (socket) => (socket[CLIENT_DATA].login !== login)
    });
  }

  _broadcastMessage(type, message, { socketFilter = allSockets }) {
    this._userSockets.forEach(function(sockets, login) {
      // Take all sockets which fulfill the filter condition:
      [...sockets].filter(socketFilter).forEach(function(recipientSocket) {
        // Guard clause: avoid re-broadcasting the message to the same socket.
        if (recipientSocket === message.senderSocket) {
          return;
        }
        recipientSocket.emit(type, message);
      });
    });
  }

  _authorizeSocket(login, socket) {
    // Register the socket as this user's:
    // (We need to clean up previous registrations first in case the user
    //  is changing logins.)
    const previousLogin = socket[CLIENT_DATA].login;
    const currentLoginHadSocketsBefore = Boolean(this._userSockets.get(login));
    this._unregisterSocket(socket);
    socket[CLIENT_DATA].login = login;
    this._registerSocket(socket);
    // If the user was a different login before, and the old login has
    //  just lost all sockets, that means the user has changed identity.
    // In a Shakespearean fashion, we make the old persona leave and the
    //  new one join.
    if (previousLogin && previousLogin !== login && !this._userSockets.get(previousLogin)) {
      this._notifyUserLeave(previousLogin);
    }
    // If the user had no sockets before, it means he's newly arrived:
    if (!currentLoginHadSocketsBefore) {
      this._notifyUserJoin(socket[CLIENT_DATA].login);
    }
  }

  _installSocketHandlers() {
    const self = this;
    const logger = self._logger;
    const authenticator = self._authenticator;

    self._app.on('connection', function(socket) {
      socket[CLIENT_DATA] = {
        login: null
      };

      socket.on('chat', function({ body }) {
        // Guard clause: skip messages from unauthenticated ("anonymous") sockets.
        if (!socket[CLIENT_DATA].login) {
          logger.warn({ event: 'message.unauthenticated', size: body.length });
          return;
        }
        logger.debug({ event: 'message', from: socket[CLIENT_DATA].login, body: body });
        self._broadcastMessage('chat', { from: socket[CLIENT_DATA].login, body: body }, {
          // Send the chat message to all sockets besides the socket where it came from:
          socketFilter: (recipientSocket) => (recipientSocket !== socket)
        });
      });

      socket.on('auth', function({ login, password }) {
        authenticator.authenticate(login, password).then(function() {
          socket.emit('auth', { success: true, login: login });
          self._authorizeSocket(login, socket);
        }, function(error) {
          socket.emit('auth', { success: false, error: { name: error.name, code: error.code, message: error.message } });
        });
      });

      socket.on('register', function({ login, password }) {
        authenticator.register(login, password).then(function() {
          socket.emit('register', { success: true, login: login });
        }, function(error) {
          socket.emit('register', { success: false, error: { name: error.name, code: error.code, message: error.message } });
        });
      });

      socket.on('disconnect', function() {
        self._unregisterSocket(socket);
        // Notify others that the user has left if that was the last socket
        //  of the given user:
        if (socket[CLIENT_DATA].login && !self._userSockets.get(socket[CLIENT_DATA].login)) {
          self._notifyUserLeave(socket[CLIENT_DATA].login);
        }
      });
    });
  }

  start() {
    // Construct an options object, with sane defaults:
    const options = {
      HTTP_PORT: this._options.HTTP_PORT || defaults.HTTP_PORT,
      HTTP_HOST: this._options.HTTP_HOST || defaults.HTTP_HOST
    };
    const server = this._httpServer;
    const logger = this._logger;

    // Start listening and react to errors:
    return when.promise(function(fulfill, reject) {
      server.listen(options.HTTP_PORT, options.HTTP_HOST);
      server.on('listening', function() {
        logger.info({ event: 'http.listening', options: options }, 'HTTP server listening');
        fulfill();
      });
      server.on('error', function(listeningError) {
        logger.error({ event: 'http.error', err: listeningError }, 'HTTP server listening failed');
        reject(listeningError);
      });
    });
  }
}

module.exports = ChatServer;
