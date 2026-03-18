/**
 * GameState.js — Local game state store
 * Dependencies: none
 * Stores the last state_update from server, player info, scenario data.
 * Provides simple event emitter for state changes.
 */

// eslint-disable-next-line no-unused-vars
var GameState = (function () {
  'use strict';

  // Event listeners: { eventName: [callback, ...] }
  var listeners = {};

  // Player identity (from welcome message)
  var playerId = null;
  var playerToken = null;
  var playerName = '';

  // Scenario data (from welcome message)
  var scenarioPublic = null;

  // Last state_update from server
  var state = {
    step: 0,
    stepInterval: 5,
    players: [],       // [{ id, name, score, unitCount, buildingCount, color }]
    cells: {},         // { "q,r": { q, r, biome, resource, building, overlays, ... } }
    units: [],         // [{ id, type, owner, q, r, hp, maxHp, attack, defense, range, speed, visionRange, status, scriptName, vars, level, statusEffects }]
    buildings: [],     // [{ id, type, owner, q, r, hp, maxHp, defense, visionRange, scriptName, production, queue, storage, level }]
    foggedCells: [],   // [{ q, r, biome, resource, building }] — previously seen, currently invisible
    visibleCells: {},  // set of "q,r" keys for cells visible to the player
    events: [],        // recent game events for this player
    logs: []           // script logs
  };

  // Selected entity (unit or building)
  var selectedUnit = null;
  var selectedBuilding = null;

  // Scripts list from server
  var scripts = {};  // { scriptName: code }

  // Chat messages
  var chatMessages = [];
  var unreadChat = 0;

  // Step timer
  var stepTimerStart = 0;

  /**
   * Subscribe to an event
   * @param {string} event
   * @param {Function} callback
   */
  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event
   * @param {Function} callback
   */
  function off(event, callback) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(function (cb) { return cb !== callback; });
  }

  /**
   * Emit an event
   * @param {string} event
   * @param {*} data
   */
  function emit(event, data) {
    var cbs = listeners[event];
    if (!cbs) return;
    for (var i = 0; i < cbs.length; i++) {
      try {
        cbs[i](data);
      } catch (e) {
        console.error('GameState event handler error (' + event + '):', e);
      }
    }
  }

  /**
   * Set player identity from welcome message
   */
  function setPlayer(id, token, name) {
    playerId = id;
    playerToken = token;
    playerName = name;
    emit('player_set', { id: id, token: token, name: name });
  }

  /**
   * Set scenario public data from welcome message
   */
  function setScenarioPublic(data) {
    scenarioPublic = data;
    emit('scenario_loaded', data);
  }

  /**
   * Apply a state_update from the server
   */
  function applyStateUpdate(update) {
    state.step = update.step != null ? update.step : state.step;
    state.stepInterval = update.stepInterval != null ? update.stepInterval : state.stepInterval;

    if (update.players) state.players = update.players;
    if (update.cells) state.cells = update.cells;
    if (update.units) state.units = update.units;
    if (update.buildings) state.buildings = update.buildings;
    if (update.foggedCells) state.foggedCells = update.foggedCells;
    if (update.events) state.events = update.events;

    // Build visibleCells set
    if (update.cells) {
      state.visibleCells = {};
      var keys = Object.keys(update.cells);
      for (var i = 0; i < keys.length; i++) {
        state.visibleCells[keys[i]] = true;
      }
    }

    // Update selected entity if still exists
    if (selectedUnit) {
      var found = false;
      for (var j = 0; j < state.units.length; j++) {
        if (state.units[j].id === selectedUnit.id) {
          selectedUnit = state.units[j];
          found = true;
          break;
        }
      }
      if (!found) selectedUnit = null;
    }
    if (selectedBuilding) {
      var bFound = false;
      for (var k = 0; k < state.buildings.length; k++) {
        if (state.buildings[k].id === selectedBuilding.id) {
          selectedBuilding = state.buildings[k];
          bFound = true;
          break;
        }
      }
      if (!bFound) selectedBuilding = null;
    }

    stepTimerStart = Date.now();
    emit('state_update', state);
  }

  /**
   * Add log entries from server
   */
  function addLogs(entries) {
    if (!Array.isArray(entries)) entries = [entries];
    for (var i = 0; i < entries.length; i++) {
      state.logs.push(entries[i]);
    }
    // Keep last 500 logs
    if (state.logs.length > 500) {
      state.logs = state.logs.slice(state.logs.length - 500);
    }
    emit('logs', entries);
  }

  /**
   * Add a chat message
   */
  function addChatMessage(msg) {
    chatMessages.push(msg);
    if (chatMessages.length > 200) {
      chatMessages = chatMessages.slice(chatMessages.length - 200);
    }
    unreadChat++;
    emit('chat', msg);
  }

  function resetUnreadChat() {
    unreadChat = 0;
    emit('chat_read', null);
  }

  /**
   * Update the scripts list
   */
  function setScripts(scriptsList) {
    scripts = {};
    if (Array.isArray(scriptsList)) {
      for (var i = 0; i < scriptsList.length; i++) {
        scripts[scriptsList[i].name] = scriptsList[i].code;
      }
    } else if (scriptsList && typeof scriptsList === 'object') {
      scripts = scriptsList;
    }
    emit('scripts_list', scripts);
  }

  /**
   * Select a unit
   */
  function selectUnit(unit) {
    selectedUnit = unit;
    selectedBuilding = null;
    emit('selection_changed', { type: 'unit', entity: unit });
  }

  /**
   * Select a building
   */
  function selectBuilding(building) {
    selectedBuilding = building;
    selectedUnit = null;
    emit('selection_changed', { type: 'building', entity: building });
  }

  /**
   * Clear selection
   */
  function clearSelection() {
    selectedUnit = null;
    selectedBuilding = null;
    emit('selection_changed', { type: null, entity: null });
  }

  /**
   * Get elapsed time ratio for step timer (0..1)
   */
  function getStepTimerRatio() {
    if (!state.stepInterval) return 0;
    var elapsed = (Date.now() - stepTimerStart) / 1000;
    return Math.min(elapsed / state.stepInterval, 1);
  }

  /**
   * Get remaining time until next step (seconds)
   */
  function getStepTimeRemaining() {
    if (!state.stepInterval) return 0;
    var elapsed = (Date.now() - stepTimerStart) / 1000;
    return Math.max(state.stepInterval - elapsed, 0);
  }

  /**
   * Get this player's data from players list
   */
  function getMyPlayer() {
    if (!playerId) return null;
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === playerId) return state.players[i];
    }
    return null;
  }

  /**
   * Get my units
   */
  function getMyUnits() {
    return state.units.filter(function (u) { return u.owner === playerId; });
  }

  /**
   * Get my buildings
   */
  function getMyBuildings() {
    return state.buildings.filter(function (b) { return b.owner === playerId; });
  }

  /**
   * Find unit at given hex coordinate (from visible units)
   */
  function getUnitAt(q, r) {
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].q === q && state.units[i].r === r) {
        return state.units[i];
      }
    }
    return null;
  }

  /**
   * Find building at given hex coordinate
   */
  function getBuildingAt(q, r) {
    for (var i = 0; i < state.buildings.length; i++) {
      if (state.buildings[i].q === q && state.buildings[i].r === r) {
        return state.buildings[i];
      }
    }
    return null;
  }

  /**
   * Reset all state (for reconnect/new game)
   */
  function reset() {
    state.step = 0;
    state.players = [];
    state.cells = {};
    state.units = [];
    state.buildings = [];
    state.foggedCells = [];
    state.visibleCells = {};
    state.events = [];
    state.logs = [];
    selectedUnit = null;
    selectedBuilding = null;
    scripts = {};
    chatMessages = [];
    unreadChat = 0;
    emit('reset', null);
  }

  return {
    on: on,
    off: off,
    emit: emit,

    // Player
    setPlayer: setPlayer,
    get playerId() { return playerId; },
    get playerToken() { return playerToken; },
    get playerName() { return playerName; },

    // Scenario
    setScenarioPublic: setScenarioPublic,
    get scenarioPublic() { return scenarioPublic; },

    // State
    applyStateUpdate: applyStateUpdate,
    get state() { return state; },

    // Logs
    addLogs: addLogs,

    // Chat
    addChatMessage: addChatMessage,
    resetUnreadChat: resetUnreadChat,
    get chatMessages() { return chatMessages; },
    get unreadChat() { return unreadChat; },

    // Scripts
    setScripts: setScripts,
    get scripts() { return scripts; },

    // Selection
    selectUnit: selectUnit,
    selectBuilding: selectBuilding,
    clearSelection: clearSelection,
    get selectedUnit() { return selectedUnit; },
    get selectedBuilding() { return selectedBuilding; },

    // Helpers
    getStepTimerRatio: getStepTimerRatio,
    getStepTimeRemaining: getStepTimeRemaining,
    getMyPlayer: getMyPlayer,
    getMyUnits: getMyUnits,
    getMyBuildings: getMyBuildings,
    getUnitAt: getUnitAt,
    getBuildingAt: getBuildingAt,

    // Reset
    reset: reset
  };
})();
