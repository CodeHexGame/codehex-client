/**
 * Camera.js — Camera state, drag, zoom, transform
 * Dependencies: HexMath
 * Handles: pan (mouse drag), zoom (wheel), double-click center, Home key
 * Applies camera transform to canvas contexts before rendering
 */

// eslint-disable-next-line no-unused-vars
var Camera = (function () {
  'use strict';

  var x = 0;
  var y = 0;
  var zoom = 1.0;
  var minZoom = 0.3;
  var maxZoom = 3.0;

  // Drag state
  var dragging = false;
  var dragStartX = 0;
  var dragStartY = 0;
  var dragCamStartX = 0;
  var dragCamStartY = 0;

  // Canvas element reference
  var canvas = null;

  /**
   * Initialize camera with the main canvas for input events
   * @param {HTMLCanvasElement} canvasEl
   */
  function init(canvasEl) {
    canvas = canvasEl;

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);
    window.addEventListener('keydown', onKeyDown);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return; // Only left mouse
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragCamStartX = x;
    dragCamStartY = y;
    canvas.style.cursor = 'grabbing';
  }

  function onMouseMove(e) {
    if (!dragging) return;
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    x = dragCamStartX + dx;
    y = dragCamStartY + dy;
  }

  function onMouseUp() {
    if (dragging) {
      dragging = false;
      if (canvas) canvas.style.cursor = 'default';
    }
  }

  function onWheel(e) {
    e.preventDefault();

    // Zoom toward mouse position
    var rect = canvas.getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    var mouseY = e.clientY - rect.top;

    var oldZoom = zoom;
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.min(maxZoom, Math.max(minZoom, zoom * delta));

    // Adjust position so zoom centers on mouse
    var zoomRatio = zoom / oldZoom;
    x = mouseX - (mouseX - x) * zoomRatio;
    y = mouseY - (mouseY - y) * zoomRatio;
  }

  function onDblClick(e) {
    // Double-click on a unit → center on it (handled by click system in UI)
    // Here we just provide the method, actual entity detection is external
    var rect = canvas.getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    var mouseY = e.clientY - rect.top;

    // Convert screen coords to world coords
    var worldPos = screenToWorld(mouseX, mouseY);
    var hex = HexMath.pixelToHex(worldPos.x, worldPos.y, getHexSize());

    // Emit event for UI to handle
    GameState.emit('camera_dblclick', { q: hex.q, r: hex.r, worldX: worldPos.x, worldY: worldPos.y });
  }

  function onKeyDown(e) {
    if (e.key === 'Home') {
      centerOnStart();
    }
  }

  /**
   * Get the current hex size (based on a base size, affected by zoom is applied via transform)
   */
  function getHexSize() {
    return 40; // Base hex size in world pixels
  }

  /**
   * Apply camera transform to a canvas 2D context
   * @param {CanvasRenderingContext2D} ctx
   */
  function applyTransform(ctx) {
    ctx.setTransform(zoom, 0, 0, zoom, x, y);
  }

  /**
   * Reset transform on a context
   * @param {CanvasRenderingContext2D} ctx
   */
  function resetTransform(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Convert screen pixel to world coordinate
   * @param {number} sx - Screen x
   * @param {number} sy - Screen y
   * @returns {{x: number, y: number}} World coordinates
   */
  function screenToWorld(sx, sy) {
    return {
      x: (sx - x) / zoom,
      y: (sy - y) / zoom
    };
  }

  /**
   * Convert world coordinate to screen pixel
   * @param {number} wx - World x
   * @param {number} wy - World y
   * @returns {{x: number, y: number}} Screen coordinates
   */
  function worldToScreen(wx, wy) {
    return {
      x: wx * zoom + x,
      y: wy * zoom + y
    };
  }

  /**
   * Center the camera on a hex coordinate
   * @param {number} q
   * @param {number} r
   */
  function centerOnHex(q, r) {
    var hexSize = getHexSize();
    var pos = HexMath.hexToPixel(q, r, hexSize);
    var cw = canvas ? canvas.width : window.innerWidth;
    var ch = canvas ? canvas.height : window.innerHeight;
    x = cw / 2 - pos.x * zoom;
    y = ch / 2 - pos.y * zoom;
  }

  /**
   * Center on the player's starting position (first unit or building)
   */
  function centerOnStart() {
    var myUnits = GameState.getMyUnits();
    if (myUnits.length > 0) {
      centerOnHex(myUnits[0].q, myUnits[0].r);
      return;
    }
    var myBuildings = GameState.getMyBuildings();
    if (myBuildings.length > 0) {
      centerOnHex(myBuildings[0].q, myBuildings[0].r);
      return;
    }
    // Default: center on origin
    centerOnHex(0, 0);
  }

  /**
   * Get the visible world bounds (in world coordinates)
   * Used for culling off-screen hexes
   * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
   */
  function getVisibleBounds() {
    var cw = canvas ? canvas.width : window.innerWidth;
    var ch = canvas ? canvas.height : window.innerHeight;
    var topLeft = screenToWorld(0, 0);
    var bottomRight = screenToWorld(cw, ch);
    return {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y
    };
  }

  /**
   * Check if dragging (to suppress click events during drag)
   */
  function isDragging() {
    return dragging;
  }

  /**
   * Check if a drag distance was significant (> 5px)
   */
  function wasDragSignificant(e) {
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    return Math.sqrt(dx * dx + dy * dy) > 5;
  }

  function destroy() {
    if (canvas) {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDblClick);
    }
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
  }

  return {
    init: init,
    applyTransform: applyTransform,
    resetTransform: resetTransform,
    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,
    centerOnHex: centerOnHex,
    centerOnStart: centerOnStart,
    getVisibleBounds: getVisibleBounds,
    getHexSize: getHexSize,
    isDragging: isDragging,
    wasDragSignificant: wasDragSignificant,
    destroy: destroy,
    get x() { return x; },
    get y() { return y; },
    get zoom() { return zoom; },
    set x(v) { x = v; },
    set y(v) { y = v; },
    set zoom(v) { zoom = Math.min(maxZoom, Math.max(minZoom, v)); }
  };
})();
