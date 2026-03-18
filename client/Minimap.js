/**
 * Minimap.js — Small overview map (bottom-right)
 * Dependencies: HexMath, GameState
 * Shows entire map scaled down: biomes, own units (blue dots),
 * own buildings (blue squares), visible enemies (red dots),
 * fog overlay, camera viewport rectangle.
 * Click to move camera. Updates only on state_update.
 */

// eslint-disable-next-line no-unused-vars
var Minimap = (function () {
  'use strict';

  var canvas = null;
  var ctx = null;
  var SIZE = 180; // Canvas size in pixels

  // Calculated map bounds (world coords)
  var mapMinX = 0;
  var mapMinY = 0;
  var mapMaxX = 0;
  var mapMaxY = 0;
  var mapScale = 1;

  /**
   * Initialize the minimap canvas
   * @param {HTMLCanvasElement} canvasEl
   */
  function init(canvasEl) {
    canvas = canvasEl;
    canvas.width = SIZE;
    canvas.height = SIZE;
    ctx = canvas.getContext('2d');

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  }

  /**
   * Render the minimap (called on state_update, not every frame)
   */
  function render() {
    if (!ctx) return;
    var state = GameState.state;
    var sp = GameState.scenarioPublic;
    var hexSize = Camera.getHexSize();

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Calculate bounds of all known cells
    calculateBounds(state, hexSize);

    if (mapScale <= 0) return;

    // Draw visible cells
    var keys = Object.keys(state.cells);
    for (var i = 0; i < keys.length; i++) {
      var cell = state.cells[keys[i]];
      drawMinimapCell(cell, hexSize, sp, 1.0);
    }

    // Draw fogged cells (dimmed)
    if (state.foggedCells) {
      for (var j = 0; j < state.foggedCells.length; j++) {
        drawMinimapCell(state.foggedCells[j], hexSize, sp, 0.35);
      }
    }

    // Draw own buildings (blue squares)
    var myId = GameState.playerId;
    for (var b = 0; b < state.buildings.length; b++) {
      var building = state.buildings[b];
      var bpos = worldToMinimap(HexMath.hexToPixel(building.q, building.r, hexSize));
      var isOwn = building.owner === myId;
      ctx.fillStyle = isOwn ? '#4488ff' : '#ff4444';
      ctx.fillRect(bpos.x - 2, bpos.y - 2, 4, 4);
    }

    // Draw units (own = blue dots, enemy = red dots)
    for (var u = 0; u < state.units.length; u++) {
      var unit = state.units[u];
      var upos = worldToMinimap(HexMath.hexToPixel(unit.q, unit.r, hexSize));
      var isOwnUnit = unit.owner === myId;
      ctx.fillStyle = isOwnUnit ? '#4488ff' : '#ff4444';
      ctx.beginPath();
      ctx.arc(upos.x, upos.y, isOwnUnit ? 2.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw camera viewport rectangle
    drawViewport(hexSize);

    // Border
    ctx.strokeStyle = 'rgba(15, 52, 96, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, SIZE, SIZE);
  }

  function calculateBounds(state, hexSize) {
    var cells = Object.keys(state.cells);
    var foggedCells = state.foggedCells || [];

    if (cells.length === 0 && foggedCells.length === 0) {
      mapMinX = 0;
      mapMinY = 0;
      mapMaxX = 1;
      mapMaxY = 1;
      mapScale = 1;
      return;
    }

    mapMinX = Infinity;
    mapMinY = Infinity;
    mapMaxX = -Infinity;
    mapMaxY = -Infinity;

    function expandBounds(q, r) {
      var pos = HexMath.hexToPixel(q, r, hexSize);
      if (pos.x < mapMinX) mapMinX = pos.x;
      if (pos.y < mapMinY) mapMinY = pos.y;
      if (pos.x > mapMaxX) mapMaxX = pos.x;
      if (pos.y > mapMaxY) mapMaxY = pos.y;
    }

    for (var i = 0; i < cells.length; i++) {
      var c = state.cells[cells[i]];
      expandBounds(c.q, c.r);
    }
    for (var j = 0; j < foggedCells.length; j++) {
      expandBounds(foggedCells[j].q, foggedCells[j].r);
    }

    // Add margin
    var margin = hexSize * 2;
    mapMinX -= margin;
    mapMinY -= margin;
    mapMaxX += margin;
    mapMaxY += margin;

    var rangeX = mapMaxX - mapMinX;
    var rangeY = mapMaxY - mapMinY;
    mapScale = Math.min(SIZE / rangeX, SIZE / rangeY);
  }

  function worldToMinimap(worldPos) {
    return {
      x: (worldPos.x - mapMinX) * mapScale,
      y: (worldPos.y - mapMinY) * mapScale
    };
  }

  function minimapToWorld(mx, my) {
    return {
      x: mx / mapScale + mapMinX,
      y: my / mapScale + mapMinY
    };
  }

  function drawMinimapCell(cell, hexSize, sp, alpha) {
    var pos = HexMath.hexToPixel(cell.q, cell.r, hexSize);
    var mpos = worldToMinimap(pos);
    var mSize = hexSize * mapScale;

    var color = '#555555';
    if (sp && sp.biomes && sp.biomes[cell.biome] && sp.biomes[cell.biome].color) {
      color = sp.biomes[cell.biome].color;
    } else if (HexRenderer.DEFAULT_BIOME_COLORS[cell.biome]) {
      color = HexRenderer.DEFAULT_BIOME_COLORS[cell.biome];
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;

    // Draw as small circle for cleaner look at minimap scale
    var radius = Math.max(mSize * 0.8, 1.5);
    ctx.beginPath();
    ctx.arc(mpos.x, mpos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  function drawViewport() {
    var cw = window.innerWidth;
    var ch = window.innerHeight;

    // Get world coords of screen corners
    var topLeft = Camera.screenToWorld(0, 0);
    var bottomRight = Camera.screenToWorld(cw, ch);

    var tl = worldToMinimap(topLeft);
    var br = worldToMinimap(bottomRight);

    var w = br.x - tl.x;
    var h = br.y - tl.y;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      Math.max(0, tl.x),
      Math.max(0, tl.y),
      Math.min(w, SIZE - tl.x),
      Math.min(h, SIZE - tl.y)
    );
  }

  function onClick(e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    var world = minimapToWorld(mx, my);
    var hex = HexMath.pixelToHex(world.x, world.y, Camera.getHexSize());
    Camera.centerOnHex(hex.q, hex.r);
  }

  return {
    init: init,
    render: render
  };
})();
