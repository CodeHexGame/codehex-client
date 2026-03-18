/**
 * Connection.js — WebSocket connection, protocol handler, reconnect logic
 * Dependencies: GameState, UI
 * Handles: connect, rejoin, join_game, message routing, ping/pong, auto-reconnect
 */

// eslint-disable-next-line no-unused-vars
var Connection = (function () {
  'use strict';

  var ws = null;
  var serverAddress = '';
  var playerName = '';
  var pingTime = 0;
  var latency = 0;

  // Reconnect state
  var reconnectAttempts = 0;
  var maxReconnectAttempts = 10;
  var reconnectTimer = null;
  var intentionalClose = false;

  /**
   * Initialize connection module — listen for GameState events
   */
  function init() {
    GameState.on('connect', onConnectRequest);
    GameState.on('reconnect', onReconnectRequest);
    GameState.on('send_message', sendMessage);
  }

  /**
   * Handle connect request from UI
   */
  function onConnectRequest(data) {
    serverAddress = data.server;
    playerName = data.name;
    connect(data.savedPlayerId, data.savedToken);
  }

  /**
   * Handle reconnect request (e.g. from game over "Play Again")
   */
  function onReconnectRequest() {
    reconnectAttempts = 0;
    connect(GameState.playerId, GameState.playerToken);
  }

  /**
   * Open WebSocket connection
   */
  function connect(savedPlayerId, savedToken) {
    if (ws) {
      intentionalClose = true;
      ws.close();
    }
    intentionalClose = false;

    // Build WebSocket URL
    var protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
    var url = protocol + serverAddress;
    // If address already has ws:// or wss://, use as-is
    if (serverAddress.indexOf('ws://') === 0 || serverAddress.indexOf('wss://') === 0) {
      url = serverAddress;
    }

    UI.setLoginStatus('Connecting to ' + serverAddress + '...');

    try {
      ws = new WebSocket(url);
    } catch (e) {
      UI.setLoginStatus('Invalid server address');
      return;
    }

    ws.onopen = function () {
      reconnectAttempts = 0;
      UI.setLoginStatus('Connected! Joining...');

      // Try rejoin first if we have saved credentials
      if (savedPlayerId && savedToken) {
        send({
          type: 'rejoin',
          playerId: savedPlayerId,
          token: savedToken
        });
      } else {
        send({
          type: 'join_game',
          name: playerName
        });
      }
    };

    ws.onmessage = function (event) {
      var data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        console.error('Connection: failed to parse message', e);
        return;
      }
      handleMessage(data);
    };

    ws.onclose = function () {
      if (!intentionalClose) {
        scheduleReconnect(savedPlayerId, savedToken);
      }
    };

    ws.onerror = function () {
      UI.setLoginStatus('Connection error');
    };
  }

  /**
   * Route incoming server messages
   */
  function handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        onWelcome(msg);
        break;

      case 'state_update':
        GameState.applyStateUpdate(msg);
        break;

      case 'game_event':
        GameState.emit('game_event', msg);
        AudioManager.playSound(msg.sound || 'event');
        break;

      case 'logs':
        GameState.addLogs(msg.entries || msg.logs || [msg]);
        break;

      case 'error':
        UI.showToast({ message: msg.message || 'Server error', type: 'error' });
        // If error is about rejoin, fall back to join_game
        if (msg.code === 'invalid_token' || msg.code === 'rejoin_failed') {
          send({ type: 'join_game', name: playerName });
        }
        break;

      case 'game_over':
        UI.showGameOver(msg);
        AudioManager.playSound('game_over');
        break;

      case 'player_died':
        if (msg.playerId === GameState.playerId) {
          UI.showToast({ message: 'You have been defeated!', type: 'error' });
          AudioManager.playSound('death');
        } else {
          UI.showToast({ message: (msg.playerName || 'A player') + ' has been eliminated' });
        }
        break;

      case 'chat':
        GameState.addChatMessage(msg);
        AudioManager.playSound('chat');
        break;

      case 'scripts_list':
        GameState.setScripts(msg.scripts);
        break;

      case 'script_saved':
        GameState.emit('script_saved', msg);
        break;

      case 'pong':
        latency = Date.now() - pingTime;
        break;

      default:
        console.log('Connection: unknown message type', msg.type, msg);
    }
  }

  /**
   * Handle welcome message — init game
   */
  function onWelcome(msg) {
    // Save player identity
    GameState.setPlayer(msg.playerId, msg.token, playerName);
    UI.saveCredentials(serverAddress, msg.playerId, msg.token);

    // Save scenario data
    GameState.setScenarioPublic(msg.scenarioPublic || {});

    // Apply theme
    UI.applyTheme(msg.scenarioPublic);

    // Init audio with scenario data
    AudioManager.init(msg.scenarioPublic);

    // Show loading screen and load sprites
    UI.showLoadingScreen('Loading assets...');

    SpriteManager.loadAll(msg.scenarioPublic || {}, function (loaded, total) {
      UI.updateLoadingProgress(loaded, total);
    }).then(function () {
      // Loading done — show game screen
      UI.showGameScreen();
      AudioManager.startMusic();

      // Request scripts
      send({ type: 'get_scripts' });

      // Center camera on start
      Camera.centerOnStart();

      // Start ping interval
      startPing();
    });
  }

  // === Send helpers ===

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function sendMessage(data) {
    send(data);
  }

  // === Ping ===

  var pingInterval = null;

  function startPing() {
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(function () {
      pingTime = Date.now();
      send({ type: 'ping' });
    }, 10000);
  }

  // === Reconnect ===

  function scheduleReconnect(savedPlayerId, savedToken) {
    if (reconnectAttempts >= maxReconnectAttempts) {
      UI.showToast({ message: 'Lost connection to server', type: 'error' });
      UI.showLoginScreen();
      return;
    }

    reconnectAttempts++;
    var delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);

    UI.showToast({ message: 'Reconnecting in ' + (delay / 1000) + 's... (attempt ' + reconnectAttempts + ')' });

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(function () {
      connect(
        savedPlayerId || GameState.playerId,
        savedToken || GameState.playerToken
      );
    }, delay);
  }

  // === Public API ===

  function disconnect() {
    intentionalClose = true;
    if (ws) ws.close();
    if (pingInterval) clearInterval(pingInterval);
    if (reconnectTimer) clearTimeout(reconnectTimer);
  }

  return {
    init: init,
    send: send,
    disconnect: disconnect,
    get latency() { return latency; },
    get connected() { return ws && ws.readyState === WebSocket.OPEN; }
  };
})();
