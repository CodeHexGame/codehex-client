/**
 * Editor.js — Code editor panel with CodeMirror 5, tabs, save/upload/assign
 * Dependencies: GameState, Connection (via events)
 * Manages script tabs, CodeMirror instance, file upload, script assignment.
 */

// eslint-disable-next-line no-unused-vars
var Editor = (function () {
  'use strict';

  var panel = null;
  var tabsContainer = null;
  var bodyContainer = null;
  var toolbarContainer = null;
  var resizeHandle = null;
  var cmInstance = null;

  // Tab state
  var tabs = [];         // [{ name, code, dirty }]
  var activeTabIndex = -1;

  // Editor open state
  var isOpen = false;
  var editorHeight = 0.5; // Ratio of screen height

  // Resize drag state
  var resizing = false;
  var resizeStartY = 0;
  var resizeStartHeight = 0;

  // Save flash timeout
  var saveFlashTimeout = null;

  var DEFAULT_TEMPLATE = '// Script name: new_script.js\nonTick(() => {\n  // Your code here\n});\n';

  /**
   * Initialize the editor panel
   */
  function init() {
    panel = document.getElementById('editor-panel');
    tabsContainer = panel.querySelector('.editor-tabs');
    bodyContainer = panel.querySelector('.editor-body');
    toolbarContainer = panel.querySelector('.editor-toolbar');
    resizeHandle = document.getElementById('editor-resize-handle');

    // Create CodeMirror instance
    cmInstance = CodeMirror(bodyContainer, {
      value: '',
      mode: 'javascript',
      theme: 'dracula',
      lineNumbers: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      lineWrapping: false,
      readOnly: true  // Until a tab is selected
    });

    // Track changes
    cmInstance.on('change', function () {
      if (activeTabIndex >= 0 && activeTabIndex < tabs.length) {
        tabs[activeTabIndex].code = cmInstance.getValue();
        tabs[activeTabIndex].dirty = true;
        updateTabDisplay();
      }
    });

    // Build toolbar buttons
    buildToolbar();

    // Resize handle events
    resizeHandle.addEventListener('mousedown', onResizeStart);
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);

    // Listen for scripts list from server
    GameState.on('scripts_list', function (scriptMap) {
      loadScriptsFromServer(scriptMap);
    });

    // Listen for script_saved confirmation
    GameState.on('script_saved', function (data) {
      showSaveFlash();
      if (data && data.name) {
        for (var i = 0; i < tabs.length; i++) {
          if (tabs[i].name === data.name) {
            tabs[i].dirty = false;
            updateTabDisplay();
            break;
          }
        }
      }
    });
  }

  function buildToolbar() {
    toolbarContainer.innerHTML = '';

    // Upload button
    var uploadBtn = document.createElement('button');
    uploadBtn.className = 'btn';
    uploadBtn.textContent = '\uD83D\uDCC1 Upload .js';
    uploadBtn.onclick = onUpload;
    toolbarContainer.appendChild(uploadBtn);

    // Spacer
    var spacer = document.createElement('div');
    spacer.style.flex = '1';
    toolbarContainer.appendChild(spacer);

    // Save button
    var saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-success';
    saveBtn.id = 'editor-save-btn';
    saveBtn.textContent = '\uD83D\uDCBE Save';
    saveBtn.onclick = onSave;
    toolbarContainer.appendChild(saveBtn);

    // Assign button
    var assignBtn = document.createElement('button');
    assignBtn.className = 'btn';
    assignBtn.textContent = '\u25B6 Assign to selected';
    assignBtn.onclick = onAssign;
    toolbarContainer.appendChild(assignBtn);
  }

  /**
   * Load scripts from server response
   */
  function loadScriptsFromServer(scriptMap) {
    var names = Object.keys(scriptMap);

    // Merge with existing tabs (keep dirty state)
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var existing = findTab(name);
      if (existing >= 0) {
        // Only update if not dirty
        if (!tabs[existing].dirty) {
          tabs[existing].code = scriptMap[name];
        }
      } else {
        tabs.push({ name: name, code: scriptMap[name], dirty: false });
      }
    }

    updateTabDisplay();

    // If no active tab, select first
    if (activeTabIndex < 0 && tabs.length > 0) {
      selectTab(0);
    } else if (activeTabIndex >= 0) {
      // Refresh editor content
      selectTab(activeTabIndex);
    }
  }

  function findTab(name) {
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].name === name) return i;
    }
    return -1;
  }

  /**
   * Open/close the editor panel
   */
  function toggle() {
    isOpen = !isOpen;
    if (isOpen) {
      panel.classList.add('open');
      panel.style.height = (editorHeight * 100) + '%';
      resizeHandle.style.display = 'block';
      resizeHandle.style.bottom = (editorHeight * 100) + '%';
      cmInstance.refresh();
    } else {
      panel.classList.remove('open');
      panel.style.height = '0';
      resizeHandle.style.display = 'none';
    }
    return isOpen;
  }

  /**
   * Select a tab by index
   */
  function selectTab(index) {
    if (index < 0 || index >= tabs.length) return;
    activeTabIndex = index;
    cmInstance.setOption('readOnly', false);
    cmInstance.setValue(tabs[index].code);
    cmInstance.clearHistory();
    updateTabDisplay();
  }

  /**
   * Close a tab
   */
  function closeTab(index) {
    if (index < 0 || index >= tabs.length) return;
    tabs.splice(index, 1);
    if (activeTabIndex >= tabs.length) {
      activeTabIndex = tabs.length - 1;
    }
    if (activeTabIndex >= 0) {
      selectTab(activeTabIndex);
    } else {
      cmInstance.setValue('');
      cmInstance.setOption('readOnly', true);
    }
    updateTabDisplay();
  }

  /**
   * Create a new script tab
   */
  function newTab() {
    var count = tabs.length + 1;
    var name = 'new_script_' + count + '.js';
    // Ensure unique name
    while (findTab(name) >= 0) {
      count++;
      name = 'new_script_' + count + '.js';
    }

    var code = DEFAULT_TEMPLATE.replace('new_script.js', name);
    tabs.push({ name: name, code: code, dirty: true });
    selectTab(tabs.length - 1);
  }

  /**
   * Update the tab bar display
   */
  function updateTabDisplay() {
    tabsContainer.innerHTML = '';

    for (var i = 0; i < tabs.length; i++) {
      (function (idx) {
        var tab = document.createElement('div');
        tab.className = 'editor-tab' + (idx === activeTabIndex ? ' active' : '');
        tab.onclick = function () { selectTab(idx); };

        var nameSpan = document.createElement('span');
        nameSpan.textContent = tabs[idx].name + (tabs[idx].dirty ? ' *' : '');
        tab.appendChild(nameSpan);

        var closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '\u00D7';
        closeBtn.onclick = function (e) {
          e.stopPropagation();
          closeTab(idx);
        };
        tab.appendChild(closeBtn);

        tabsContainer.appendChild(tab);
      })(i);
    }

    // New tab button
    var newBtn = document.createElement('div');
    newBtn.className = 'editor-tab-new';
    newBtn.textContent = '+ New';
    newBtn.onclick = newTab;
    tabsContainer.appendChild(newBtn);
  }

  // --- Actions ---

  function onSave() {
    if (activeTabIndex < 0 || activeTabIndex >= tabs.length) return;
    var tab = tabs[activeTabIndex];
    GameState.emit('send_message', {
      type: 'save_script',
      name: tab.name,
      code: tab.code
    });
  }

  function onAssign() {
    if (activeTabIndex < 0) return;
    var tab = tabs[activeTabIndex];
    var sel = GameState.selectedUnit || GameState.selectedBuilding;
    if (!sel) {
      GameState.emit('toast', { message: 'Select a unit or building first', type: 'error' });
      return;
    }
    GameState.emit('send_message', {
      type: 'set_script',
      entityId: sel.id,
      scriptName: tab.name
    });
  }

  function onUpload() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js';
    input.onchange = function () {
      if (!input.files || input.files.length === 0) return;
      var file = input.files[0];
      var reader = new FileReader();
      reader.onload = function () {
        var code = reader.result;
        var name = file.name;
        var existingIdx = findTab(name);
        if (existingIdx >= 0) {
          tabs[existingIdx].code = code;
          tabs[existingIdx].dirty = true;
          selectTab(existingIdx);
        } else {
          tabs.push({ name: name, code: code, dirty: true });
          selectTab(tabs.length - 1);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function showSaveFlash() {
    var btn = document.getElementById('editor-save-btn');
    if (!btn) return;
    var original = btn.textContent;
    btn.textContent = '\u2705 Saved';
    if (saveFlashTimeout) clearTimeout(saveFlashTimeout);
    saveFlashTimeout = setTimeout(function () {
      btn.textContent = original;
    }, 1500);
  }

  // --- Resize ---

  function onResizeStart(e) {
    resizing = true;
    resizeStartY = e.clientY;
    resizeStartHeight = editorHeight;
    resizeHandle.classList.add('dragging');
    e.preventDefault();
  }

  function onResizeMove(e) {
    if (!resizing) return;
    var dy = resizeStartY - e.clientY;
    var screenH = window.innerHeight;
    editorHeight = Math.min(0.8, Math.max(0.15, resizeStartHeight + dy / screenH));
    panel.style.height = (editorHeight * 100) + '%';
    resizeHandle.style.bottom = (editorHeight * 100) + '%';
    cmInstance.refresh();
  }

  function onResizeEnd() {
    if (resizing) {
      resizing = false;
      resizeHandle.classList.remove('dragging');
    }
  }

  /**
   * Open editor and focus on a specific script
   */
  function openScript(scriptName) {
    if (!isOpen) toggle();
    var idx = findTab(scriptName);
    if (idx >= 0) {
      selectTab(idx);
    }
  }

  return {
    init: init,
    toggle: toggle,
    openScript: openScript,
    newTab: newTab,
    get isOpen() { return isOpen; },
    get activeTab() { return activeTabIndex >= 0 ? tabs[activeTabIndex] : null; },
    get tabs() { return tabs; }
  };
})();
