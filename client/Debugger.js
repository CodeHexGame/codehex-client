/**
 * Debugger.js — Debug overlay renderer on canvas-debug
 * Dependencies: Camera, HexMath, GameState
 * Draws: movement arrows, status icons, vision/attack ranges,
 *        selection highlight, grid lines, hex coordinates
 */

// eslint-disable-next-line no-unused-vars
var Debugger = (function () {
  'use strict';

  var ctx = null;
  var canvas = null;
  var enabled = false;
  var showGrid = false;

  // Status icon map
  var STATUS_ICONS = {
    attacking:   '\u2694\uFE0F',
    moving:      '\uD83D\uDEB6',
    harvesting:  '\u26CF\uFE0F',
    building:    '\uD83C\uDFD7\uFE0F',
    idle:        '\uD83D\uDCA4'
  };

  /**
   * Initialize with the debug canvas
   * @param {HTMLCanvasElement} canvasEl
   */
  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
  }

  /**
   * Toggle debug mode
   * @returns {boolean} New enabled state
   */
  function toggle() {
    enabled = !enabled;
    if (!enabled) {
      Camera.resetTransform(ctx);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return enabled;
  }

  /**
   * Toggle grid lines
   * @returns {boolean}
   */
  function toggleGrid() {
    showGrid = !showGrid;
    return showGrid;
  }

  /**
   * Main render call for debug layer
   */
  function render() {
    if (!ctx || !enabled) return;
    var state = GameState.state;
    var hexSize = Camera.getHexSize();

    Camera.resetTransform(ctx);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    Camera.applyTransform(ctx);

    var bounds = Camera.getVisibleBounds();
    var margin = hexSize * 2;
    bounds.minX -= margin;
    bounds.minY -= margin;
    bounds.maxX += margin;
    bounds.maxY += margin;

    // Grid lines
    if (showGrid) {
      drawGridLines(state, hexSize, bounds);
    }

    // Hex coordinates at high zoom
    if (Camera.zoom > 1.5) {
      drawCoordinates(state, hexSize, bounds);
    }

    // Selection highlight
    var selUnit = GameState.selectedUnit;
    var selBuilding = GameState.selectedBuilding;

    if (selUnit) {
      drawSelectionHighlight(selUnit.q, selUnit.r, hexSize);
      drawVisionRange(selUnit.q, selUnit.r, selUnit.visionRange || 3, hexSize);
      if (selUnit.range) {
        drawAttackRange(selUnit.q, selUnit.r, selUnit.range, hexSize);
      }
    } else if (selBuilding) {
      drawSelectionHighlight(selBuilding.q, selBuilding.r, hexSize);
      if (selBuilding.visionRange) {
        drawVisionRange(selBuilding.q, selBuilding.r, selBuilding.visionRange, hexSize);
      }
    }

    // Movement arrows and status icons for all units
    for (var i = 0; i < state.units.length; i++) {
      var unit = state.units[i];
      var pos = HexMath.hexToPixel(unit.q, unit.r, hexSize);
      if (pos.x < bounds.minX || pos.x > bounds.maxX ||
          pos.y < bounds.minY || pos.y > bounds.maxY) continue;

      // Movement arrow
      if (unit.status === 'moving' && unit.targetQ != null && unit.targetR != null) {
        drawMovementArrow(unit, hexSize);
      }

      // Status icon
      drawStatusIcon(unit, pos.x, pos.y, hexSize);
    }
  }

  // --- Grid lines ---

  function drawGridLines(state, hexSize, bounds) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;
    var keys = Object.keys(state.cells);
    for (var i = 0; i < keys.length; i++) {
      var cell = state.cells[keys[i]];
      var pos = HexMath.hexToPixel(cell.q, cell.r, hexSize);
      if (pos.x < bounds.minX || pos.x > bounds.maxX ||
          pos.y < bounds.minY || pos.y > bounds.maxY) continue;

      var corners = HexMath.hexCorners(pos.x, pos.y, hexSize);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (var c = 1; c < corners.length; c++) {
        ctx.lineTo(corners[c].x, corners[c].y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  // --- Coordinates ---

  function drawCoordinates(state, hexSize, bounds) {
    ctx.font = Math.round(hexSize * 0.22) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

    var keys = Object.keys(state.cells);
    for (var i = 0; i < keys.length; i++) {
      var cell = state.cells[keys[i]];
      var pos = HexMath.hexToPixel(cell.q, cell.r, hexSize);
      if (pos.x < bounds.minX || pos.x > bounds.maxX ||
          pos.y < bounds.minY || pos.y > bounds.maxY) continue;

      ctx.fillText(cell.q + ',' + cell.r, pos.x, pos.y + hexSize * 0.55);
    }
  }

  // --- Selection highlight ---

  function drawSelectionHighlight(q, r, hexSize) {
    var pos = HexMath.hexToPixel(q, r, hexSize);
    var corners = HexMath.hexCorners(pos.x, pos.y, hexSize);

    // Pulsing effect
    var pulse = 0.6 + Math.sin(Date.now() / 200) * 0.4;

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (var i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 255, 0, ' + pulse + ')';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // --- Vision range ---

  function drawVisionRange(cq, cr, range, hexSize) {
    var cells = HexMath.hexRange(cq, cr, range);
    ctx.globalAlpha = 0.1;
    for (var i = 0; i < cells.length; i++) {
      var pos = HexMath.hexToPixel(cells[i].q, cells[i].r, hexSize);
      var corners = HexMath.hexCorners(pos.x, pos.y, hexSize * 0.95);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (var c = 1; c < corners.length; c++) {
        ctx.lineTo(corners[c].x, corners[c].y);
      }
      ctx.closePath();
      ctx.fillStyle = '#87ceeb';
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  // --- Attack range ---

  function drawAttackRange(cq, cr, range, hexSize) {
    var cells = HexMath.hexRange(cq, cr, range);
    ctx.globalAlpha = 0.12;
    for (var i = 0; i < cells.length; i++) {
      var pos = HexMath.hexToPixel(cells[i].q, cells[i].r, hexSize);
      var corners = HexMath.hexCorners(pos.x, pos.y, hexSize * 0.9);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (var c = 1; c < corners.length; c++) {
        ctx.lineTo(corners[c].x, corners[c].y);
      }
      ctx.closePath();
      ctx.fillStyle = '#e94560';
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  // --- Movement arrow ---

  function drawMovementArrow(unit, hexSize) {
    var from = HexMath.hexToPixel(unit.q, unit.r, hexSize);
    var to = HexMath.hexToPixel(unit.targetQ, unit.targetR, hexSize);

    // Arrow line
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    // Normalize
    var nx = dx / len;
    var ny = dy / len;

    // Shorten arrow to not overlap unit
    var startOffset = hexSize * 0.5;
    var endOffset = hexSize * 0.3;
    var sx = from.x + nx * startOffset;
    var sy = from.y + ny * startOffset;
    var ex = to.x - nx * endOffset;
    var ey = to.y - ny * endOffset;

    // Get player color
    var color = getPlayerColor(unit.owner);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    var headLen = 8;
    var angle = Math.atan2(ey - sy, ex - sx);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
    ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  }

  // --- Status icon ---

  function drawStatusIcon(unit, px, py, hexSize) {
    var icon = STATUS_ICONS[unit.status];
    if (!icon) icon = STATUS_ICONS.idle;

    ctx.font = Math.round(hexSize * 0.3) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, px, py - hexSize * 0.85);
  }

  // --- Helpers ---

  function getPlayerColor(ownerId) {
    var state = GameState.state;
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === ownerId) {
        return state.players[i].color || '#ffffff';
      }
    }
    return '#ffffff';
  }

  return {
    init: init,
    toggle: toggle,
    toggleGrid: toggleGrid,
    render: render,
    get enabled() { return enabled; },
    get showGrid() { return showGrid; }
  };
})();
