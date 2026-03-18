/**
 * FogRenderer.js — Fog of war renderer on canvas-fog
 * Dependencies: Camera, HexMath, GameState
 * Draws dark overlay on cells not visible to the player.
 * Supports soft edge gradients when fogStyle.edge === "soft".
 */

// eslint-disable-next-line no-unused-vars
var FogRenderer = (function () {
  'use strict';

  var ctx = null;
  var canvas = null;

  /**
   * Initialize with the fog canvas
   * @param {HTMLCanvasElement} canvasEl
   */
  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
  }

  /**
   * Render fog of war
   * Fully dark on cells that were never seen.
   * Semi-transparent on cells in foggedCells (seen before but not currently visible).
   * Clear on currently visible cells.
   */
  function render() {
    if (!ctx) return;
    var state = GameState.state;
    var sp = GameState.scenarioPublic;
    var hexSize = Camera.getHexSize();

    Camera.resetTransform(ctx);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If no cell data, nothing to fog
    if (!state.cells || Object.keys(state.cells).length === 0) return;

    Camera.applyTransform(ctx);

    var fogColor = 'rgba(0, 0, 0, 0.7)';
    var fogStyle = (sp && sp.fogStyle) || {};
    var softEdge = fogStyle.edge === 'soft';
    var bounds = Camera.getVisibleBounds();
    var margin = hexSize * 2;
    bounds.minX -= margin;
    bounds.minY -= margin;
    bounds.maxX += margin;
    bounds.maxY += margin;

    // Collect all known cell coordinates (visible + fogged)
    // Then determine which need fog overlay
    var allKnownKeys = {};

    // Visible cells — no fog
    var visKeys = Object.keys(state.visibleCells);
    for (var i = 0; i < visKeys.length; i++) {
      allKnownKeys[visKeys[i]] = 'visible';
    }

    // Fogged cells — semi-transparent fog
    if (state.foggedCells) {
      for (var j = 0; j < state.foggedCells.length; j++) {
        var fc = state.foggedCells[j];
        var fkey = HexMath.hexKey(fc.q, fc.r);
        if (!allKnownKeys[fkey]) {
          allKnownKeys[fkey] = 'fogged';
        }
      }
    }

    // Draw fog on fogged cells
    var foggedKeys = Object.keys(allKnownKeys);
    for (var k = 0; k < foggedKeys.length; k++) {
      if (allKnownKeys[foggedKeys[k]] !== 'fogged') continue;
      var coord = HexMath.parseHexKey(foggedKeys[k]);
      var pos = HexMath.hexToPixel(coord.q, coord.r, hexSize);
      if (pos.x < bounds.minX || pos.x > bounds.maxX ||
          pos.y < bounds.minY || pos.y > bounds.maxY) continue;

      if (softEdge) {
        drawSoftFogHex(pos.x, pos.y, hexSize, 0.45);
      } else {
        drawFogHex(pos.x, pos.y, hexSize, 'rgba(0, 0, 0, 0.45)');
      }
    }

    // For cells adjacent to visible area that are NOT in allKnownKeys,
    // we want full dark fog. We approximate by drawing full-coverage fog
    // on any cell that is in neither visible nor fogged.
    // Since we don't know all map cells, we draw a dark overlay approach:
    // We iterate visible neighbors and fog the unknown ones.
    drawUnknownFog(state, hexSize, allKnownKeys, bounds, softEdge);
  }

  /**
   * Draw full fog on cells near visible area that are completely unknown
   */
  function drawUnknownFog(state, hexSize, knownKeys, bounds, softEdge) {
    var checked = {};
    var visKeys = Object.keys(state.visibleCells);

    for (var i = 0; i < visKeys.length; i++) {
      var coord = HexMath.parseHexKey(visKeys[i]);
      var neighbors = HexMath.hexNeighbors(coord.q, coord.r);

      for (var n = 0; n < neighbors.length; n++) {
        var nk = HexMath.hexKey(neighbors[n].q, neighbors[n].r);
        if (knownKeys[nk] || checked[nk]) continue;
        checked[nk] = true;

        var pos = HexMath.hexToPixel(neighbors[n].q, neighbors[n].r, hexSize);
        if (pos.x < bounds.minX || pos.x > bounds.maxX ||
            pos.y < bounds.minY || pos.y > bounds.maxY) continue;

        if (softEdge) {
          drawSoftFogHex(pos.x, pos.y, hexSize, 0.7);
        } else {
          drawFogHex(pos.x, pos.y, hexSize, 'rgba(0, 0, 0, 0.7)');
        }
      }
    }
  }

  function drawFogHex(px, py, hexSize, color) {
    var corners = HexMath.hexCorners(px, py, hexSize);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (var i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawSoftFogHex(px, py, hexSize, alpha) {
    var gradient = ctx.createRadialGradient(px, py, 0, px, py, hexSize * 1.1);
    gradient.addColorStop(0, 'rgba(0, 0, 0, ' + (alpha * 0.5) + ')');
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, ' + alpha + ')');
    gradient.addColorStop(1, 'rgba(0, 0, 0, ' + alpha + ')');

    var corners = HexMath.hexCorners(px, py, hexSize);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (var i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  return {
    init: init,
    render: render
  };
})();
