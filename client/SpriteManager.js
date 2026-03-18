/**
 * SpriteManager.js — Sprite loading, caching, and animation frame calculation
 * Dependencies: none
 * Loads sprite sheets from scenarioPublic.sprites, provides drawFrame for animated sprites.
 * Falls back gracefully when images fail to load.
 */

// eslint-disable-next-line no-unused-vars
var SpriteManager = (function () {
  'use strict';

  // Image cache: { url: HTMLImageElement }
  var cache = {};

  // Loading state
  var totalAssets = 0;
  var loadedAssets = 0;
  var onProgressCallback = null;

  /**
   * Load all sprites from scenarioPublic
   * @param {object} scenarioPublic
   * @param {Function} [onProgress] - Called with (loaded, total) during loading
   * @returns {Promise} Resolves when all sprites attempted (failures are silent)
   */
  function loadAll(scenarioPublic, onProgress) {
    onProgressCallback = onProgress || null;
    var urls = collectUrls(scenarioPublic);
    totalAssets = urls.length;
    loadedAssets = 0;

    if (totalAssets === 0) {
      return Promise.resolve();
    }

    var promises = urls.map(function (url) {
      return loadImage(url);
    });

    return Promise.all(promises);
  }

  /**
   * Collect all image URLs from scenarioPublic.sprites
   */
  function collectUrls(sp) {
    var urls = [];
    var baseUrl = sp.spritesBaseUrl || '';
    var sprites = sp.sprites;
    if (!sprites) return urls;

    // Units
    if (sprites.units) {
      Object.keys(sprites.units).forEach(function (key) {
        var u = sprites.units[key];
        if (u.file) urls.push(baseUrl + u.file);
      });
    }

    // Buildings
    if (sprites.buildings) {
      Object.keys(sprites.buildings).forEach(function (key) {
        var b = sprites.buildings[key];
        if (b.file) urls.push(baseUrl + b.file);
        if (b.damaged) urls.push(baseUrl + b.damaged);
        if (b.ruined) urls.push(baseUrl + b.ruined);
      });
    }

    // Biomes
    if (sprites.biomes) {
      Object.keys(sprites.biomes).forEach(function (key) {
        var b = sprites.biomes[key];
        if (b.file) urls.push(baseUrl + b.file);
      });
    }

    // Resources
    if (sprites.resources) {
      Object.keys(sprites.resources).forEach(function (key) {
        var r = sprites.resources[key];
        if (r.icon) urls.push(baseUrl + r.icon);
        if (r.sprite) urls.push(baseUrl + r.sprite);
      });
    }

    // Effects
    if (sprites.effects) {
      Object.keys(sprites.effects).forEach(function (key) {
        var e = sprites.effects[key];
        if (e.file) urls.push(baseUrl + e.file);
      });
    }

    return urls;
  }

  /**
   * Load a single image, resolve on load or error (never reject)
   */
  function loadImage(url) {
    return new Promise(function (resolve) {
      if (cache[url]) {
        loadedAssets++;
        reportProgress();
        resolve(cache[url]);
        return;
      }

      var img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = function () {
        cache[url] = img;
        loadedAssets++;
        reportProgress();
        resolve(img);
      };

      img.onerror = function () {
        // Mark as failed — will use fallback rendering
        cache[url] = null;
        loadedAssets++;
        reportProgress();
        resolve(null);
      };

      img.src = url;
    });
  }

  function reportProgress() {
    if (onProgressCallback) {
      onProgressCallback(loadedAssets, totalAssets);
    }
  }

  /**
   * Get a loaded image by URL
   * @param {string} url
   * @returns {HTMLImageElement|null}
   */
  function getImage(url) {
    return cache[url] || null;
  }

  /**
   * Get sprite image for a unit type
   * @param {string} unitType
   * @param {object} scenarioPublic
   * @returns {HTMLImageElement|null}
   */
  function getUnitImage(unitType, scenarioPublic) {
    if (!scenarioPublic || !scenarioPublic.sprites || !scenarioPublic.sprites.units) return null;
    var def = scenarioPublic.sprites.units[unitType];
    if (!def || !def.file) return null;
    return getImage((scenarioPublic.spritesBaseUrl || '') + def.file);
  }

  /**
   * Get sprite image for a building type (with damage states)
   * @param {string} buildingType
   * @param {number} hpRatio - Current HP / Max HP (0..1)
   * @param {object} scenarioPublic
   * @returns {HTMLImageElement|null}
   */
  function getBuildingImage(buildingType, hpRatio, scenarioPublic) {
    if (!scenarioPublic || !scenarioPublic.sprites || !scenarioPublic.sprites.buildings) return null;
    var def = scenarioPublic.sprites.buildings[buildingType];
    if (!def) return null;
    var baseUrl = scenarioPublic.spritesBaseUrl || '';

    if (hpRatio < 0.2 && def.ruined) {
      return getImage(baseUrl + def.ruined) || getImage(baseUrl + def.file);
    }
    if (hpRatio < 0.5 && def.damaged) {
      return getImage(baseUrl + def.damaged) || getImage(baseUrl + def.file);
    }
    return def.file ? getImage(baseUrl + def.file) : null;
  }

  /**
   * Get biome tile image
   */
  function getBiomeImage(biome, scenarioPublic) {
    if (!scenarioPublic || !scenarioPublic.sprites || !scenarioPublic.sprites.biomes) return null;
    var def = scenarioPublic.sprites.biomes[biome];
    if (!def || !def.file) return null;
    return getImage((scenarioPublic.spritesBaseUrl || '') + def.file);
  }

  /**
   * Get resource sprite on map
   */
  function getResourceSprite(resourceType, scenarioPublic) {
    if (!scenarioPublic || !scenarioPublic.sprites || !scenarioPublic.sprites.resources) return null;
    var def = scenarioPublic.sprites.resources[resourceType];
    if (!def || !def.sprite) return null;
    return getImage((scenarioPublic.spritesBaseUrl || '') + def.sprite);
  }

  /**
   * Get resource icon for UI panel
   */
  function getResourceIconUrl(resourceType, scenarioPublic) {
    if (!scenarioPublic || !scenarioPublic.sprites || !scenarioPublic.sprites.resources) return null;
    var def = scenarioPublic.sprites.resources[resourceType];
    if (!def || !def.icon) return null;
    return (scenarioPublic.spritesBaseUrl || '') + def.icon;
  }

  /**
   * Draw a single animation frame from a sprite sheet
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLImageElement} img - Sprite sheet
   * @param {object} anim - { row, frames, fps, loop }
   * @param {number} frameIndex - Current frame index
   * @param {number} x - Destination x
   * @param {number} y - Destination y
   * @param {number} w - Destination width
   * @param {number} h - Destination height
   */
  function drawFrame(ctx, img, anim, frameIndex, x, y, w, h) {
    var sx = frameIndex * anim.frameW;
    var sy = (anim.row || 0) * anim.frameH;
    ctx.drawImage(img, sx, sy, anim.frameW, anim.frameH, x, y, w, h);
  }

  /**
   * Calculate the current animation frame index based on time
   * @param {object} anim - { frames, fps, loop }
   * @param {number} [startTime] - Animation start timestamp (for non-looping)
   * @returns {number} Frame index
   */
  function getFrameIndex(anim, startTime) {
    var fps = anim.fps || 4;
    var frames = anim.frames || 1;
    var loop = anim.loop !== false;

    if (loop) {
      return Math.floor(Date.now() / (1000 / fps)) % frames;
    }

    // Non-looping: clamp to last frame
    if (!startTime) return frames - 1;
    var elapsed = (Date.now() - startTime) / 1000;
    var frame = Math.floor(elapsed * fps);
    return Math.min(frame, frames - 1);
  }

  /**
   * Get animation definition for a unit's current status
   * @param {string} unitType
   * @param {string} status - idle, moving, attacking, etc.
   * @param {object} scenarioPublic
   * @returns {object|null} Animation definition
   */
  function getUnitAnimation(unitType, status, scenarioPublic) {
    if (!scenarioPublic || !scenarioPublic.sprites || !scenarioPublic.sprites.units) return null;
    var def = scenarioPublic.sprites.units[unitType];
    if (!def || !def.animations) return null;

    // Map unit status to animation name
    var animMap = {
      'idle': 'idle',
      'moving': 'move',
      'attacking': 'attack',
      'harvesting': 'idle',
      'building': 'idle',
      'dead': 'die'
    };

    var animName = animMap[status] || 'idle';
    var anim = def.animations[animName] || def.animations.idle;
    if (!anim) return null;

    // Ensure frameW/frameH are on the animation object
    return {
      row: anim.row || 0,
      frames: anim.frames || 1,
      fps: anim.fps || 4,
      loop: anim.loop !== false,
      frameW: def.frameW || 64,
      frameH: def.frameH || 64
    };
  }

  /**
   * Get biome animation (e.g. animated water tiles)
   */
  function getBiomeAnimation(biome, scenarioPublic) {
    if (!scenarioPublic || !scenarioPublic.sprites || !scenarioPublic.sprites.biomes) return null;
    var def = scenarioPublic.sprites.biomes[biome];
    if (!def || !def.animations) return null;
    var anim = def.animations.idle;
    if (!anim) return null;
    return {
      row: anim.row || 0,
      frames: anim.frames || 1,
      fps: anim.fps || 2,
      loop: true,
      frameW: def.frameW || 64,
      frameH: def.frameH || 64
    };
  }

  /**
   * Get scale for a unit type sprite
   */
  function getUnitScale(unitType, scenarioPublic) {
    if (!scenarioPublic || !scenarioPublic.sprites || !scenarioPublic.sprites.units) return 1.0;
    var def = scenarioPublic.sprites.units[unitType];
    return (def && def.scale) || 1.0;
  }

  /**
   * Get scale for a building type sprite
   */
  function getBuildingScale(buildingType, scenarioPublic) {
    if (!scenarioPublic || !scenarioPublic.sprites || !scenarioPublic.sprites.buildings) return 1.0;
    var def = scenarioPublic.sprites.buildings[buildingType];
    return (def && def.scale) || 1.0;
  }

  return {
    loadAll: loadAll,
    getImage: getImage,
    getUnitImage: getUnitImage,
    getBuildingImage: getBuildingImage,
    getBiomeImage: getBiomeImage,
    getResourceSprite: getResourceSprite,
    getResourceIconUrl: getResourceIconUrl,
    drawFrame: drawFrame,
    getFrameIndex: getFrameIndex,
    getUnitAnimation: getUnitAnimation,
    getBiomeAnimation: getBiomeAnimation,
    getUnitScale: getUnitScale,
    getBuildingScale: getBuildingScale,
    get loadedAssets() { return loadedAssets; },
    get totalAssets() { return totalAssets; }
  };
})();
