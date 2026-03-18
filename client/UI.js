/**
 * UI.js — All HTML panels, tab bar, login/loading/game-over screens
 * Dependencies: GameState, Editor, Minimap
 * Manages: login screen, loading screen, resource panel, status panel,
 *          selection panel, tab bar, chat, scores, logs, toasts, game over screen,
 *          audio controls, click-to-select on canvas
 */

// eslint-disable-next-line no-unused-vars
var UI = (function () {
  'use strict';

  // DOM references (set in init)
  var loginScreen, loadingScreen, gameScreen, gameover;
  var loginForm, loginServerInput, loginNameInput, loginBtn, loginStatus, recentServersList;
  var loadingText, progressBarFill;
  var panelResources, panelStatus, panelSelection, tabBar;
  var chatPanel, chatMessages, chatInput;
  var scoresPanel, logsPanel;
  var toastContainer;
  var audioControls;

  // Tab state
  var activeTab = null;  // 'editor', 'debug', 'chat', 'scores', 'logs'

  // Recent servers
  var RECENT_SERVERS_KEY = 'codehex_recent_servers';
  var MAX_RECENT = 5;

  // Saved credentials per server
  var CREDENTIALS_KEY = 'codehex_credentials';

  /**
   * Initialize all UI elements and event listeners
   */
  function init() {
    // Get references
    loginScreen = document.getElementById('login-screen');
    loadingScreen = document.getElementById('loading-screen');
    gameScreen = document.getElementById('game-screen');
    gameover = document.getElementById('gameover-screen');

    loginServerInput = document.getElementById('login-server');
    loginNameInput = document.getElementById('login-name');
    loginBtn = document.getElementById('login-btn');
    loginStatus = document.getElementById('login-status');
    recentServersList = document.getElementById('recent-servers-list');

    loadingText = document.querySelector('#loading-screen .loading-text');
    progressBarFill = document.querySelector('#loading-screen .progress-bar-fill');

    panelResources = document.getElementById('panel-resources');
    panelStatus = document.getElementById('panel-status');
    panelSelection = document.getElementById('panel-selection');
    tabBar = document.getElementById('tab-bar');

    chatPanel = document.getElementById('chat-panel');
    chatMessages = document.querySelector('#chat-panel .chat-messages');
    chatInput = document.querySelector('#chat-panel .chat-input-row input');

    scoresPanel = document.getElementById('scores-panel');
    logsPanel = document.getElementById('logs-panel');
    toastContainer = document.getElementById('toast-container');
    audioControls = document.getElementById('audio-controls');

    // Login form
    loginBtn.addEventListener('click', onConnect);
    loginServerInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') onConnect();
    });
    loginNameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') onConnect();
    });

    // Load recent servers
    renderRecentServers();

    // Load saved name
    var savedName = localStorage.getItem('codehex_player_name') || '';
    if (savedName) loginNameInput.value = savedName;

    // Tab bar buttons
    setupTabBar();

    // Audio controls
    setupAudioControls();

    // Chat send
    var chatSendBtn = document.querySelector('#chat-panel .chat-input-row button');
    if (chatSendBtn) {
      chatSendBtn.addEventListener('click', onChatSend);
    }
    if (chatInput) {
      chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') onChatSend();
      });
    }

    // Close buttons
    setupCloseButtons();

    // Canvas click for selection
    var gameCanvas = document.getElementById('canvas-game');
    if (gameCanvas) {
      gameCanvas.addEventListener('click', onCanvasClick);
    }

    // Subscribe to GameState events
    GameState.on('state_update', onStateUpdate);
    GameState.on('chat', onChatMessage);
    GameState.on('logs', onNewLogs);
    GameState.on('selection_changed', onSelectionChanged);
    GameState.on('toast', showToast);
    GameState.on('game_event', onGameEvent);
    GameState.on('chat_read', updateChatBadge);

    // Status timer interval
    setInterval(updateStatusTimer, 200);
  }

  // === Login ===

  function onConnect() {
    var server = loginServerInput.value.trim();
    var name = loginNameInput.value.trim();
    if (!server || !name) {
      setLoginStatus('Enter server address and name');
      return;
    }

    localStorage.setItem('codehex_player_name', name);
    addRecentServer(server);

    setLoginStatus('Connecting...');
    loginBtn.disabled = true;

    // Check for saved credentials
    var creds = getSavedCredentials(server);

    GameState.emit('connect', {
      server: server,
      name: name,
      savedPlayerId: creds ? creds.playerId : null,
      savedToken: creds ? creds.token : null
    });
  }

  function setLoginStatus(text) {
    if (loginStatus) loginStatus.textContent = text;
  }

  function getRecentServers() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_SERVERS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function addRecentServer(server) {
    var list = getRecentServers().filter(function (s) { return s !== server; });
    list.unshift(server);
    if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SERVERS_KEY, JSON.stringify(list));
    renderRecentServers();
  }

  function renderRecentServers() {
    if (!recentServersList) return;
    var list = getRecentServers();
    recentServersList.innerHTML = '';
    for (var i = 0; i < list.length; i++) {
      (function (server) {
        var li = document.createElement('li');
        li.textContent = '\u2022 ' + server;
        li.onclick = function () {
          loginServerInput.value = server;
        };
        recentServersList.appendChild(li);
      })(list[i]);
    }
  }

  function getSavedCredentials(server) {
    try {
      var all = JSON.parse(localStorage.getItem(CREDENTIALS_KEY) || '{}');
      return all[server] || null;
    } catch (e) {
      return null;
    }
  }

  function saveCredentials(server, playerId, token) {
    try {
      var all = JSON.parse(localStorage.getItem(CREDENTIALS_KEY) || '{}');
      all[server] = { playerId: playerId, token: token };
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(all));
    } catch (e) {
      // Ignore
    }
  }

  // === Screen transitions ===

  function showLoginScreen() {
    loginScreen.style.display = 'flex';
    loadingScreen.style.display = 'none';
    gameScreen.style.display = 'none';
    gameover.classList.remove('open');
    loginBtn.disabled = false;
    setLoginStatus('');
  }

  function showLoadingScreen(text) {
    loginScreen.style.display = 'none';
    loadingScreen.style.display = 'flex';
    gameScreen.style.display = 'none';
    if (loadingText) loadingText.textContent = text || 'Loading assets...';
    if (progressBarFill) progressBarFill.style.width = '0%';
  }

  function updateLoadingProgress(loaded, total) {
    if (!progressBarFill) return;
    var pct = total > 0 ? Math.round(loaded / total * 100) : 100;
    progressBarFill.style.width = pct + '%';
    if (loadingText) loadingText.textContent = 'Loading assets... ' + loaded + '/' + total;
  }

  function showGameScreen() {
    loginScreen.style.display = 'none';
    loadingScreen.style.display = 'none';
    gameScreen.style.display = 'block';
  }

  // === Game Over ===

  function showGameOver(data) {
    gameover.classList.add('open');

    var titleEl = gameover.querySelector('.go-title');
    var subtitleEl = gameover.querySelector('.go-subtitle');
    var scoresEl = gameover.querySelector('.go-scores');
    var actionsEl = gameover.querySelector('.go-actions');

    var isWinner = data.winnerId === GameState.playerId;
    titleEl.textContent = isWinner ? '\uD83C\uDFC6 VICTORY!' : '\uD83D\uDC80 DEFEATED';
    subtitleEl.textContent = (data.winnerName || 'Unknown') + ' wins after ' + (data.step || '?') + ' steps';

    scoresEl.innerHTML = '';
    if (data.scores) {
      for (var i = 0; i < data.scores.length; i++) {
        var s = data.scores[i];
        var div = document.createElement('div');
        div.textContent = (i + 1) + '. ' + s.name + '   ' + s.score;
        if (s.id === GameState.playerId) div.style.color = '#4caf50';
        scoresEl.appendChild(div);
      }
    }

    actionsEl.innerHTML = '';
    var replayBtn = document.createElement('button');
    replayBtn.className = 'btn';
    replayBtn.textContent = '\uD83D\uDD04 Play Again';
    replayBtn.onclick = function () {
      gameover.classList.remove('open');
      GameState.emit('reconnect', null);
    };
    actionsEl.appendChild(replayBtn);

    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.textContent = '\uD83D\uDCCB Copy Results';
    copyBtn.onclick = function () {
      var text = titleEl.textContent + '\n' + subtitleEl.textContent + '\n';
      if (data.scores) {
        data.scores.forEach(function (s, idx) {
          text += (idx + 1) + '. ' + s.name + ' ' + s.score + '\n';
        });
      }
      navigator.clipboard.writeText(text).catch(function () {});
    };
    actionsEl.appendChild(copyBtn);
  }

  // === Tab bar ===

  function setupTabBar() {
    var buttons = tabBar.querySelectorAll('button[data-tab]');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var tab = btn.getAttribute('data-tab');
          toggleTab(tab);
        });
      })(buttons[i]);
    }
  }

  function toggleTab(tab) {
    if (tab === 'editor') {
      Editor.toggle();
      updateTabActive(Editor.isOpen ? 'editor' : null);
      return;
    }

    if (tab === 'debug') {
      var on = Debugger.toggle();
      updateTabActive(on ? 'debug' : (activeTab === 'debug' ? null : activeTab));
      return;
    }

    // Chat, scores, logs — toggle panels
    if (activeTab === tab) {
      // Close current panel
      closePanelByTab(tab);
      activeTab = null;
      updateTabActive(null);
    } else {
      // Close previous panel if any
      if (activeTab && activeTab !== 'editor' && activeTab !== 'debug') {
        closePanelByTab(activeTab);
      }
      openPanelByTab(tab);
      activeTab = tab;
      updateTabActive(tab);
    }
  }

  function openPanelByTab(tab) {
    if (tab === 'chat') {
      chatPanel.classList.add('open');
      GameState.resetUnreadChat();
    }
    else if (tab === 'scores') scoresPanel.classList.add('open');
    else if (tab === 'logs') logsPanel.classList.add('open');
  }

  function closePanelByTab(tab) {
    if (tab === 'chat') chatPanel.classList.remove('open');
    else if (tab === 'scores') scoresPanel.classList.remove('open');
    else if (tab === 'logs') logsPanel.classList.remove('open');
  }

  function updateTabActive(tab) {
    var buttons = tabBar.querySelectorAll('button[data-tab]');
    for (var i = 0; i < buttons.length; i++) {
      var t = buttons[i].getAttribute('data-tab');
      if (t === tab || (t === 'editor' && Editor.isOpen) || (t === 'debug' && Debugger.enabled)) {
        buttons[i].classList.add('active');
      } else {
        buttons[i].classList.remove('active');
      }
    }
  }

  // === Audio controls ===

  function setupAudioControls() {
    if (!audioControls) return;
    audioControls.innerHTML = '';

    var musicBtn = document.createElement('button');
    musicBtn.id = 'btn-music';
    musicBtn.textContent = AudioManager.musicEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07';
    musicBtn.title = 'Toggle music';
    musicBtn.onclick = function () {
      AudioManager.toggleMusic();
      musicBtn.textContent = AudioManager.musicEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07';
    };
    audioControls.appendChild(musicBtn);

    var soundBtn = document.createElement('button');
    soundBtn.id = 'btn-sound';
    soundBtn.textContent = AudioManager.soundEnabled ? '\uD83D\uDD14' : '\uD83D\uDD15';
    soundBtn.title = 'Toggle sounds';
    soundBtn.onclick = function () {
      AudioManager.toggleSound();
      soundBtn.textContent = AudioManager.soundEnabled ? '\uD83D\uDD14' : '\uD83D\uDD15';
    };
    audioControls.appendChild(soundBtn);
  }

  // === Close buttons ===

  function setupCloseButtons() {
    var closers = [
      { selector: '#panel-selection .sel-close', action: function () { GameState.clearSelection(); } },
      { selector: '#chat-panel .chat-close', action: function () { toggleTab('chat'); } },
      { selector: '#scores-panel .scores-close', action: function () { toggleTab('scores'); } },
      { selector: '#logs-panel .logs-close', action: function () { toggleTab('logs'); } }
    ];

    for (var i = 0; i < closers.length; i++) {
      var el = document.querySelector(closers[i].selector);
      if (el) {
        (function (action) {
          el.addEventListener('click', action);
        })(closers[i].action);
      }
    }
  }

  // === Canvas click → select unit/building ===

  function onCanvasClick(e) {
    if (Camera.isDragging()) return;

    var rect = e.target.getBoundingClientRect();
    var sx = e.clientX - rect.left;
    var sy = e.clientY - rect.top;
    var world = Camera.screenToWorld(sx, sy);
    var hex = HexMath.pixelToHex(world.x, world.y, Camera.getHexSize());

    // Check unit first
    var unit = GameState.getUnitAt(hex.q, hex.r);
    if (unit) {
      GameState.selectUnit(unit);
      return;
    }

    // Then building
    var building = GameState.getBuildingAt(hex.q, hex.r);
    if (building) {
      GameState.selectBuilding(building);
      return;
    }

    // Clicked empty — clear selection
    GameState.clearSelection();
  }

  // === State update UI refresh ===

  function onStateUpdate() {
    updateResourcesPanel();
    updateStatusPanel();
    updateSelectionPanel();
    updateScoresPanel();
    Minimap.render();
  }

  function updateResourcesPanel() {
    if (!panelResources) return;
    var player = GameState.getMyPlayer();
    if (!player || !player.resources) {
      panelResources.innerHTML = '';
      return;
    }

    var sp = GameState.scenarioPublic;
    var html = '';
    var res = player.resources;
    var keys = Object.keys(res);
    for (var i = 0; i < keys.length; i++) {
      var type = keys[i];
      var value = res[type];
      var icon = getResourceIcon(type, sp);
      html += '<span class="resource-item">' + icon + ' ' + value + '</span>';
    }
    panelResources.innerHTML = html;
  }

  function getResourceIcon(type, sp) {
    // Try sprite icon URL
    var iconUrl = SpriteManager.getResourceIconUrl(type, sp);
    if (iconUrl) {
      return '<img class="resource-icon" src="' + iconUrl + '" alt="' + type + '">';
    }
    // Try scenario emoji
    if (sp && sp.resources && sp.resources[type] && sp.resources[type].icon) {
      return sp.resources[type].icon;
    }
    // Default emoji
    var defaults = {
      gold: '\uD83D\uDCB0', stone: '\uD83E\uDEA8', crystal: '\u2728',
      food: '\uD83C\uDF56', wood: '\uD83C\uDF32', iron: '\u2699\uFE0F', mana: '\uD83D\uDD2E'
    };
    return defaults[type] || '\u2B22';
  }

  function updateStatusPanel() {
    if (!panelStatus) return;
    var state = GameState.state;
    var sp = GameState.scenarioPublic;
    var remaining = GameState.getStepTimeRemaining().toFixed(1);
    var scenarioName = (sp && sp.name) || '';

    var html = '<div class="status-line">Step: ' + state.step + '  \u23F1 ' + remaining + 's</div>';
    html += '<div class="status-line">Players: ' + state.players.length + '</div>';
    if (scenarioName) html += '<div class="status-line">' + scenarioName + '</div>';
    panelStatus.innerHTML = html;
  }

  function updateStatusTimer() {
    // Only update timer text in status panel (lightweight)
    if (!panelStatus || !gameScreen || gameScreen.style.display === 'none') return;
    var line = panelStatus.querySelector('.status-line');
    if (!line) return;
    var remaining = GameState.getStepTimeRemaining().toFixed(1);
    var state = GameState.state;
    line.textContent = 'Step: ' + state.step + '  \u23F1 ' + remaining + 's';
  }

  // === Selection panel ===

  function onSelectionChanged(data) {
    updateSelectionPanel();
  }

  function updateSelectionPanel() {
    var unit = GameState.selectedUnit;
    var building = GameState.selectedBuilding;

    if (!unit && !building) {
      panelSelection.style.display = 'none';
      return;
    }

    panelSelection.style.display = 'block';
    var sp = GameState.scenarioPublic;

    if (unit) {
      renderUnitSelection(unit, sp);
    } else {
      renderBuildingSelection(building, sp);
    }
  }

  function renderUnitSelection(unit, sp) {
    var typeInfo = (sp && sp.units && sp.units[unit.type]) || {};
    var icon = typeInfo.icon || '\u2694\uFE0F';
    var hpRatio = unit.maxHp ? unit.hp / unit.maxHp : 1;
    var hpClass = hpRatio < 0.25 ? 'low' : (hpRatio < 0.5 ? 'medium' : '');

    var html = '<div class="sel-header"><span>' + icon + ' ' + capitalize(unit.type) +
      (unit.level ? '  Lvl: ' + unit.level : '') + '</span>' +
      '<button class="sel-close">\u00D7</button></div>';

    html += '<div>HP: <div class="hp-bar"><div class="hp-bar-fill ' + hpClass + '" style="width:' +
      (hpRatio * 100) + '%"></div></div> ' + unit.hp + '/' + unit.maxHp + '</div>';

    html += '<div class="sel-stats">';
    if (unit.attack != null) html += 'Attack: <span>' + unit.attack + '</span> ';
    if (unit.defense != null) html += 'Defense: <span>' + unit.defense + '</span> ';
    if (unit.range != null) html += 'Range: <span>' + unit.range + '</span> ';
    if (unit.speed != null) html += 'Speed: <span>' + unit.speed + '</span> ';
    if (unit.visionRange != null) html += 'Vision: <span>' + unit.visionRange + '</span> ';
    html += '</div>';

    html += '<div class="sel-stats">Status: <span>' + (unit.status || 'idle') + '</span>';
    if (unit.scriptName) html += '  Script: <span>' + unit.scriptName + '</span>';
    html += '</div>';

    // Vars
    if (unit.vars && Object.keys(unit.vars).length > 0) {
      html += '<div class="sel-vars">' + escapeHtml(JSON.stringify(unit.vars, null, 2)) + '</div>';
    }

    // Events
    if (unit.events && unit.events.length > 0) {
      html += '<div class="sel-events">';
      var events = unit.events.slice(-5);
      for (var i = 0; i < events.length; i++) {
        html += '<div>\u2022 ' + escapeHtml(formatEvent(events[i])) + '</div>';
      }
      html += '</div>';
    }

    // Action buttons
    html += '<div class="sel-actions">';
    html += '<button class="btn" onclick="Editor.openScript(\'' + (unit.scriptName || '') + '\')">\uD83D\uDCDD Edit Script</button>';
    html += '<button class="btn" onclick="GameState.emit(\'toast\', {message: \'Select a script in the editor and use Assign\'})">\uD83D\uDD04 Change Script</button>';
    html += '</div>';

    panelSelection.innerHTML = html;

    // Re-attach close button
    var closeBtn = panelSelection.querySelector('.sel-close');
    if (closeBtn) closeBtn.onclick = function () { GameState.clearSelection(); };
  }

  function renderBuildingSelection(building, sp) {
    var typeInfo = (sp && sp.buildings && sp.buildings[building.type]) || {};
    var icon = typeInfo.icon || '\uD83C\uDFF0';
    var hpRatio = building.maxHp ? building.hp / building.maxHp : 1;
    var hpClass = hpRatio < 0.25 ? 'low' : (hpRatio < 0.5 ? 'medium' : '');

    var html = '<div class="sel-header"><span>' + icon + ' ' + capitalize(building.type) +
      (building.level ? '  Lvl: ' + building.level : '') + '</span>' +
      '<button class="sel-close">\u00D7</button></div>';

    html += '<div>HP: <div class="hp-bar"><div class="hp-bar-fill ' + hpClass + '" style="width:' +
      (hpRatio * 100) + '%"></div></div> ' + building.hp + '/' + building.maxHp + '</div>';

    html += '<div class="sel-stats">';
    if (building.defense != null) html += 'Defense: <span>' + building.defense + '</span> ';
    if (building.visionRange != null) html += 'Vision: <span>' + building.visionRange + '</span> ';
    html += '</div>';

    if (building.scriptName) {
      html += '<div class="sel-stats">Script: <span>' + building.scriptName + '</span></div>';
    }

    // Production
    if (building.production) {
      var prod = building.production;
      html += '<div class="sel-production">';
      html += 'Production: ' + capitalize(prod.type || '?') +
        ' (' + (prod.progress || 0) + '/' + (prod.total || '?') + ' steps)';
      var prodRatio = prod.total ? prod.progress / prod.total : 0;
      html += '<div class="prod-bar"><div class="prod-bar-fill" style="width:' + (prodRatio * 100) + '%"></div></div>';
      html += '</div>';
    }

    // Queue
    if (building.queue && building.queue.length > 0) {
      html += '<div class="sel-queue">';
      for (var i = 0; i < building.queue.length; i++) {
        html += '<span>[' + capitalize(building.queue[i]) + ']</span>';
      }
      html += '</div>';
    }

    // Storage
    if (building.storage) {
      html += '<div class="sel-stats">Storage: ';
      var sKeys = Object.keys(building.storage);
      for (var j = 0; j < sKeys.length; j++) {
        var sType = sKeys[j];
        var sVal = building.storage[sType];
        html += getResourceIcon(sType, sp) + ' ' + (typeof sVal === 'object' ? sVal.amount + '/' + sVal.max : sVal) + ' ';
      }
      html += '</div>';
    }

    // Action buttons
    html += '<div class="sel-actions">';
    html += '<button class="btn" onclick="Editor.openScript(\'' + (building.scriptName || '') + '\')">\uD83D\uDCDD Edit Script</button>';
    html += '<button class="btn" onclick="GameState.emit(\'toast\', {message: \'Select a script in the editor and use Assign\'})">\uD83D\uDD04 Change Script</button>';
    html += '</div>';

    panelSelection.innerHTML = html;

    var closeBtn = panelSelection.querySelector('.sel-close');
    if (closeBtn) closeBtn.onclick = function () { GameState.clearSelection(); };
  }

  // === Chat ===

  function onChatMessage(msg) {
    if (!chatMessages) return;
    var div = document.createElement('div');
    div.className = 'chat-msg' + (msg.system ? ' system' : '');
    if (msg.system) {
      div.textContent = '[Server] ' + msg.text;
    } else {
      var sender = document.createElement('span');
      sender.className = 'chat-sender';
      sender.textContent = msg.sender + ':';
      div.appendChild(sender);
      div.appendChild(document.createTextNode(' ' + msg.text));
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    updateChatBadge();
  }

  function onChatSend() {
    if (!chatInput) return;
    var text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    GameState.emit('send_message', { type: 'chat', text: text });
  }

  function updateChatBadge() {
    var btn = tabBar.querySelector('button[data-tab="chat"]');
    if (!btn) return;
    var badge = btn.querySelector('.badge');
    var count = GameState.unreadChat;
    if (count > 0 && !chatPanel.classList.contains('open')) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'badge';
        btn.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : count;
    } else if (badge) {
      badge.remove();
    }
  }

  // === Scores ===

  function updateScoresPanel() {
    if (!scoresPanel || !scoresPanel.classList.contains('open')) return;
    var state = GameState.state;
    var body = scoresPanel.querySelector('.scores-table');
    if (!body) return;

    // Sort by score descending
    var players = state.players.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });

    body.innerHTML = '';
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var row = document.createElement('div');
      row.className = 'score-row' + (p.id === GameState.playerId ? ' me' : '');
      row.innerHTML = '<span>' + (i + 1) + '. ' + escapeHtml(p.name) + '</span>' +
        '<span>' + (p.score || 0) + '  ' + (p.unitCount || 0) + 'u  ' + (p.buildingCount || 0) + 'b</span>';
      body.appendChild(row);
    }
  }

  // === Logs ===

  function onNewLogs(entries) {
    if (!logsPanel) return;
    var body = logsPanel.querySelector('.logs-body');
    if (!body) return;

    var hasError = false;
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var div = document.createElement('div');
      var level = entry.level || 'info';
      div.className = 'log-entry ' + level;
      div.textContent = '[' + (entry.step || '?') + '] ' +
        level.toUpperCase() + '  ' +
        (entry.script || '') + ': ' +
        (entry.message || entry.text || '');
      body.appendChild(div);
      if (level === 'error') hasError = true;
    }
    body.scrollTop = body.scrollHeight;

    // Show badge on logs tab if error
    if (hasError) {
      var btn = tabBar.querySelector('button[data-tab="logs"]');
      if (btn && !btn.querySelector('.badge')) {
        var badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = '!';
        btn.appendChild(badge);
      }
    }
  }

  // === Toasts ===

  function showToast(data) {
    if (!toastContainer) return;
    var msg = typeof data === 'string' ? data : data.message;
    var type = (data && data.type) || '';

    var toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.textContent = msg;
    toastContainer.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3200);
  }

  // === Game events (popup on map) ===

  function onGameEvent(event) {
    showToast({ message: event.message || event.text || JSON.stringify(event) });
  }

  // === Apply scenario theme ===

  function applyTheme(sp) {
    if (!sp) return;
    var theme = sp.uiTheme;
    if (theme) {
      if (theme.primaryColor) document.documentElement.style.setProperty('--scenario-primary', theme.primaryColor);
      if (theme.secondaryColor) document.documentElement.style.setProperty('--scenario-secondary', theme.secondaryColor);
      if (theme.accentColor) document.documentElement.style.setProperty('--scenario-accent', theme.accentColor);
    }
    // Font
    if (sp.font) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(sp.font) + '&display=swap';
      document.head.appendChild(link);
      document.body.style.fontFamily = "'" + sp.font + "', 'Segoe UI', sans-serif";
    }
  }

  // === Helpers ===

  function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatEvent(evt) {
    if (typeof evt === 'string') return evt;
    var prefix = evt.step ? '[step ' + evt.step + '] ' : '';
    return prefix + (evt.text || evt.message || JSON.stringify(evt));
  }

  return {
    init: init,
    showLoginScreen: showLoginScreen,
    showLoadingScreen: showLoadingScreen,
    updateLoadingProgress: updateLoadingProgress,
    showGameScreen: showGameScreen,
    showGameOver: showGameOver,
    showToast: showToast,
    applyTheme: applyTheme,
    setLoginStatus: setLoginStatus,
    saveCredentials: saveCredentials,
    updateScoresPanel: updateScoresPanel
  };
})();
