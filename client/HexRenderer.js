/**
 * HexRenderer.js — Main game layer renderer (canvas-game)
 * Dependencies: Camera, HexMath, SpriteManager, GameState
 * Renders: biomes, fogged cells (semi-transparent), overlays, resources,
 *          buildings, units, HP bars, status effect icons
 */

// eslint-disable-next-line no-unused-vars
var HexRenderer = (function () {
  'use strict';

  var ctx = null;
  var canvas = null;

  // Default biome colors when sprites are unavailable
  var DEFAULT_BIOME_COLORS = {
    plains:    '#4a7c4f',
    grass:     '#4a7c4f',
    forest:    '#2d5a27',
    water:     '#2a6496',
    ocean:     '#1a4a6e',
    mountain:  '#6b6b6b',
    desert:    '#c4a84e',
    sand:      '#c4a84e',
    snow:      '#d0d8e0',
    swamp:     '#4a5a3a',
    lava:      '#8b2500',
    void:      '#1a1a1a'
  };

  // Default resource emoji fallbacks
  var DEFAULT_RESOURCE_ICONS = {
    gold:    '\uD83D\uDCB0',
    stone:   '\uD83E\uDEA8',
    crystal: '\u2728',
    food:    '\uD83C\uDF56',
    wood:    '\uD83C\uDF32',
    iron:    '\u2699\uFE0F',
    mana:    '\uD83D\uDD2E'
  };

  /**
   * Initialize the renderer with the game canvas
   * @param {HTMLCanvasElement} canvasEl
   */
  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
  }

  /**
   * Main render call for the game layer
   */
  function render() {
    if (!ctx) return;
    var state = GameState.state;
    var sp = GameState.scenarioPublic;
    var hexSize = Camera.getHexSize();

    // Clear
    Camera.resetTransform(ctx);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply camera
    Camera.applyTransform(ctx);

    var bounds = Camera.getVisibleBounds();
    var margin = hexSize * 2;
    bounds.minX -= margin;
    bounds.minY -= margin;
    bounds.maxX += margin;
    bounds.maxY += margin;

    // 1. Draw visible cells (biome tiles)
    drawCells(state, sp, hexSize, bounds);

    // 2. Draw fogged cells (semi-transparent, no units)
    drawFoggedCells(state, sp, hexSize, bounds);

    // 3. Draw cell overlays (fire, holy_ground, etc.)
    drawOverlays(state, sp, hexSize, bounds);

    // 4. Draw resources on cells
    drawResources(state, sp, hexSize, bounds);

    // 5. Draw buildings
    drawBuildings(state, sp, hexSize);

    // 6. Draw units
    drawUnits(state, sp, hexSize);

    // 7. Draw HP bars over buildings and units
    drawHPBars(state, hexSize);

    // 8. Draw status effect icons over units
    drawStatusEffects(state, sp, hexSize);
  }

  // --- Cell drawing ---

  function drawCells(state, sp, hexSize, bounds) {
    var keys = Object.keys(state.cells);
    for (var i = 0; i < keys.length; i++) {
      var cell = state.cells[keys[i]];
      var pos = HexMath.hexToPixel(cell.q, cell.r, hexSize);
      if (!inBounds(pos, bounds)) continue;
      drawBiomeTile(cell.biome, pos.x, pos.y, hexSize, sp, 1.0);
    }
  }

  function drawFoggedCells(state, sp, hexSize, bounds) {
    if (!state.foggedCells || state.foggedCells.length === 0) return;
    ctx.globalAlpha = 0.4;
    for (var i = 0; i < state.foggedCells.length; i++) {
      var cell = state.foggedCells[i];
      var pos = HexMath.hexToPixel(cell.q, cell.r, hexSize);
      if (!inBounds(pos, bounds)) continue;
      drawBiomeTile(cell.biome, pos.x, pos.y, hexSize, sp, 1.0);

      // Draw resource on fogged cell (dimmed)
      if (cell.resource) {
        drawResourceAt(cell.resource, pos.x, pos.y, hexSize, sp);
      }
      // Draw building on fogged cell (dimmed)
      if (cell.building) {
        drawBuildingFallback(ctx, cell.building, pos.x, pos.y, hexSize, sp);
      }
    }
    ctx.globalAlpha = 1.0;
  }

  function drawBiomeTile(biome, px, py, hexSize, sp, alpha) {
    // Try sprite first
    var img = SpriteManager.getBiomeImage(biome, sp);
    if (img) {
      var anim = SpriteManager.getBiomeAnimation(biome, sp);
      if (anim) {
        // Animated biome tile
        var frameIdx = SpriteManager.getFrameIndex(anim);
        var drawSize = hexSize * 2;
        SpriteManager.drawFrame(ctx, img, anim, frameIdx, px - drawSize / 2, py - drawSize / 2, drawSize, drawSize);
      } else {
        // Static biome tile — draw image clipped to hex
        var size = hexSize * 2;
        ctx.save();
        drawHexPath(ctx, px, py, hexSize);
        ctx.clip();
        ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
        ctx.restore();
      }
      return;
    }

    // Fallback: colored hexagon
    var color = DEFAULT_BIOME_COLORS[biome] || '#555555';
    if (sp && sp.biomes && sp.biomes[biome] && sp.biomes[biome].color) {
      color = sp.biomes[biome].color;
    }
    drawHexagon(ctx, px, py, hexSize, color);
    drawHexOutline(ctx, px, py, hexSize, 'rgba(0,0,0,0.2)', 1);
  }

  function drawOverlays(state, sp, hexSize, bounds) {
    var keys = Object.keys(state.cells);
    for (var i = 0; i < keys.length; i++) {
      var cell = state.cells[keys[i]];
      if (!cell.overlays || cell.overlays.length === 0) continue;
      var pos = HexMath.hexToPixel(cell.q, cell.r, hexSize);
      if (!inBounds(pos, bounds)) continue;

      for (var j = 0; j < cell.overlays.length; j++) {
        var overlay = cell.overlays[j];
        var overlayColor = getOverlayColor(overlay, sp);
        ctx.globalAlpha = 0.3;
        drawHexagon(ctx, pos.x, pos.y, hexSize * 0.95, overlayColor);
        ctx.globalAlpha = 1.0;
      }
    }
  }

  function getOverlayColor(overlay, sp) {
    var name = typeof overlay === 'string' ? overlay : overlay.type;
    var colorMap = {
      fire: '#ff4500',
      holy_ground: '#ffd700',
      poison: '#00ff00',
      ice: '#87ceeb',
      darkness: '#4a0080'
    };
    if (sp && sp.overlays && sp.overlays[name] && sp.overlays[name].color) {
      return sp.overlays[name].color;
    }
    return colorMap[name] || '#ffffff';
  }

  // --- Resources ---

  function drawResources(state, sp, hexSize, bounds) {
    var keys = Object.keys(state.cells);
    for (var i = 0; i < keys.length; i++) {
      var cell = state.cells[keys[i]];
      if (!cell.resource) continue;
      var pos = HexMath.hexToPixel(cell.q, cell.r, hexSize);
      if (!inBounds(pos, bounds)) continue;
      drawResourceAt(cell.resource, pos.x, pos.y, hexSize, sp);
    }
  }

  function drawResourceAt(resource, px, py, hexSize, sp) {
    var resourceType = typeof resource === 'string' ? resource : resource.type;

    // Try sprite
    var img = SpriteManager.getResourceSprite(resourceType, sp);
    if (img) {
      var size = hexSize * 0.8;
      ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
      return;
    }

    // Fallback: emoji
    var emoji = DEFAULT_RESOURCE_ICONS[resourceType] || '\u2B22';
    ctx.font = Math.round(hexSize * 0.35) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, px, py + hexSize * 0.2);
  }

  // --- Buildings ---

  function drawBuildings(state, sp, hexSize) {
    for (var i = 0; i < state.buildings.length; i++) {
      var b = state.buildings[i];
      var pos = HexMath.hexToPixel(b.q, b.r, hexSize);
      var hpRatio = b.maxHp ? b.hp / b.maxHp : 1;

      var img = SpriteManager.getBuildingImage(b.type, hpRatio, sp);
      if (img) {
        var scale = SpriteManager.getBuildingScale(b.type, sp);
        var size = hexSize * 2 * scale;
        ctx.drawImage(img, pos.x - size / 2, pos.y - size / 2, size, size);
      } else {
        drawBuildingFallback(ctx, b, pos.x, pos.y, hexSize, sp);
      }
    }
  }

  function drawBuildingFallback(context, building, px, py, hexSize, sp) {
    var bType = typeof building === 'string' ? building : building.type;
    var color = '#666666';
    if (sp && sp.buildings && sp.buildings[bType] && sp.buildings[bType].color) {
      color = sp.buildings[bType].color;
    }

    // Draw a square-ish shape
    var size = hexSize * 0.7;
    context.fillStyle = color;
    context.fillRect(px - size / 2, py - size / 2, size, size);
    context.strokeStyle = 'rgba(255,255,255,0.3)';
    context.lineWidth = 1;
    context.strokeRect(px - size / 2, py - size / 2, size, size);

    // Letter
    context.fillStyle = '#ffffff';
    context.font = 'bold ' + Math.round(hexSize * 0.35) + 'px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(bType[0].toUpperCase(), px, py);
  }

  // --- Units ---

  function drawUnits(state, sp, hexSize) {
    for (var i = 0; i < state.units.length; i++) {
      var unit = state.units[i];
      var pos = HexMath.hexToPixel(unit.q, unit.r, hexSize);

      var img = SpriteManager.getUnitImage(unit.type, sp);
      var anim = SpriteManager.getUnitAnimation(unit.type, unit.status, sp);

      if (img && anim) {
        var frameIdx = SpriteManager.getFrameIndex(anim);
        var scale = SpriteManager.getUnitScale(unit.type, sp);
        var drawW = hexSize * 1.5 * scale;
        var drawH = hexSize * 1.5 * scale;
        SpriteManager.drawFrame(ctx, img, anim, frameIdx, pos.x - drawW / 2, pos.y - drawH / 2, drawW, drawH);
      } else {
        drawUnitFallback(ctx, unit, pos.x, pos.y, hexSize, sp);
      }
    }
  }

  function drawUnitFallback(context, unit, px, py, hexSize, sp) {
    var color = '#888888';
    if (sp && sp.units && sp.units[unit.type] && sp.units[unit.type].color) {
      color = sp.units[unit.type].color;
    }

    // Draw colored hexagon
    drawHexagon(context, px, py, hexSize * 0.5, color);
    drawHexOutline(context, px, py, hexSize * 0.5, 'rgba(255,255,255,0.4)', 1.5);

    // Letter of type in center
    context.fillStyle = '#ffffff';
    context.font = 'bold ' + Math.round(hexSize * 0.4) + 'px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(unit.type[0].toUpperCase(), px, py);
  }

  // --- HP Bars ---

  function drawHPBars(state, hexSize) {
    var barWidth = hexSize * 1.2;
    var barHeight = 4;

    // Units
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u.maxHp || u.hp >= u.maxHp) continue; // Don't show full HP
      var pos = HexMath.hexToPixel(u.q, u.r, hexSize);
      drawHPBar(pos.x, pos.y - hexSize * 0.7, barWidth, barHeight, u.hp, u.maxHp);
    }

    // Buildings
    for (var j = 0; j < state.buildings.length; j++) {
      var b = state.buildings[j];
      if (!b.maxHp || b.hp >= b.maxHp) continue;
      var bpos = HexMath.hexToPixel(b.q, b.r, hexSize);
      drawHPBar(bpos.x, bpos.y - hexSize * 0.8, barWidth, barHeight, b.hp, b.maxHp);
    }
  }

  function drawHPBar(px, py, w, h, hp, maxHp) {
    var ratio = hp / maxHp;
    var barX = px - w / 2;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX, py, w, h);

    // Fill
    if (ratio > 0.5) {
      ctx.fillStyle = '#4caf50';
    } else if (ratio > 0.25) {
      ctx.fillStyle = '#ff9800';
    } else {
      ctx.fillStyle = '#e94560';
    }
    ctx.fillRect(barX, py, w * ratio, h);

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, py, w, h);
  }

  // --- Status effects ---

  function drawStatusEffects(state, sp, hexSize) {
    for (var i = 0; i < state.units.length; i++) {
      var unit = state.units[i];
      if (!unit.statusEffects || unit.statusEffects.length === 0) continue;
      var pos = HexMath.hexToPixel(unit.q, unit.r, hexSize);

      var offsetX = -((unit.statusEffects.length - 1) * 8) / 2;
      for (var j = 0; j < unit.statusEffects.length; j++) {
        var effect = unit.statusEffects[j];
        var effectName = typeof effect === 'string' ? effect : effect.type || effect.name;
        var effectColor = '#ffffff';

        if (sp && sp.statusEffects && sp.statusEffects[effectName]) {
          effectColor = sp.statusEffects[effectName].color || effectColor;
        }

        var ex = pos.x + offsetX + j * 8;
        var ey = pos.y - hexSize * 0.9;

        ctx.beginPath();
        ctx.arc(ex, ey, 3, 0, Math.PI * 2);
        ctx.fillStyle = effectColor;
        ctx.fill();
      }
    }
  }

  // --- Hex drawing helpers ---

  function drawHexPath(context, cx, cy, size) {
    var corners = HexMath.hexCorners(cx, cy, size);
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    for (var i = 1; i < corners.length; i++) {
      context.lineTo(corners[i].x, corners[i].y);
    }
    context.closePath();
  }

  function drawHexagon(context, cx, cy, size, fillColor) {
    drawHexPath(context, cx, cy, size);
    context.fillStyle = fillColor;
    context.fill();
  }

  function drawHexOutline(context, cx, cy, size, strokeColor, lineWidth) {
    drawHexPath(context, cx, cy, size);
    context.strokeStyle = strokeColor;
    context.lineWidth = lineWidth || 1;
    context.stroke();
  }

  function inBounds(pos, bounds) {
    return pos.x >= bounds.minX && pos.x <= bounds.maxX &&
           pos.y >= bounds.minY && pos.y <= bounds.maxY;
  }

  return {
    init: init,
    render: render,
    drawHexagon: drawHexagon,
    drawHexOutline: drawHexOutline,
    drawHexPath: drawHexPath,
    drawUnitFallback: drawUnitFallback,
    drawBuildingFallback: drawBuildingFallback,
    DEFAULT_BIOME_COLORS: DEFAULT_BIOME_COLORS,
    DEFAULT_RESOURCE_ICONS: DEFAULT_RESOURCE_ICONS
  };
})();
