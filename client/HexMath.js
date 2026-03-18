/**
 * HexMath.js — Pure math utilities for flat-top hexagonal grid
 * Dependencies: none
 * Provides: hexToPixel, pixelToHex, hexRound, hexCorners, hexDistance, hexNeighbors, hexRing
 * Coordinate system: Axial (q, r), flat-top hexagons
 */

// eslint-disable-next-line no-unused-vars
var HexMath = (function () {
  'use strict';

  var SQRT3 = Math.sqrt(3);

  /**
   * Convert axial hex coordinates to pixel position (flat-top)
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @param {number} hexSize - Hex radius in pixels
   * @returns {{x: number, y: number}}
   */
  function hexToPixel(q, r, hexSize) {
    var x = hexSize * (3 / 2 * q);
    var y = hexSize * (SQRT3 / 2 * q + SQRT3 * r);
    return { x: x, y: y };
  }

  /**
   * Convert pixel position to fractional axial hex coordinates (flat-top)
   * @param {number} x - Pixel x
   * @param {number} y - Pixel y
   * @param {number} hexSize - Hex radius in pixels
   * @returns {{q: number, r: number}} Rounded hex coordinates
   */
  function pixelToHex(x, y, hexSize) {
    var q = (2 / 3 * x) / hexSize;
    var r = (-1 / 3 * x + SQRT3 / 3 * y) / hexSize;
    return hexRound(q, r);
  }

  /**
   * Round fractional axial coordinates to nearest hex
   * Uses cube coordinate rounding
   * @param {number} q - Fractional q
   * @param {number} r - Fractional r
   * @returns {{q: number, r: number}}
   */
  function hexRound(q, r) {
    var s = -q - r;
    var rq = Math.round(q);
    var rr = Math.round(r);
    var rs = Math.round(s);

    var dq = Math.abs(rq - q);
    var dr = Math.abs(rr - r);
    var ds = Math.abs(rs - s);

    if (dq > dr && dq > ds) {
      rq = -rr - rs;
    } else if (dr > ds) {
      rr = -rq - rs;
    }
    // else rs = -rq - rr (not needed for axial)

    return { q: rq, r: rr };
  }

  /**
   * Get the 6 corner points of a flat-top hexagon
   * @param {number} cx - Center x pixel
   * @param {number} cy - Center y pixel
   * @param {number} size - Hex radius in pixels
   * @returns {Array<{x: number, y: number}>}
   */
  function hexCorners(cx, cy, size) {
    var corners = [];
    for (var i = 0; i < 6; i++) {
      var angle = Math.PI / 180 * (60 * i);
      corners.push({
        x: cx + size * Math.cos(angle),
        y: cy + size * Math.sin(angle)
      });
    }
    return corners;
  }

  /**
   * Manhattan distance between two hex cells in axial coordinates
   * @param {number} q1
   * @param {number} r1
   * @param {number} q2
   * @param {number} r2
   * @returns {number}
   */
  function hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
  }

  // Axial direction vectors for flat-top hex
  var DIRECTIONS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 }
  ];

  /**
   * Get the 6 neighbor coordinates of a hex cell
   * @param {number} q
   * @param {number} r
   * @returns {Array<{q: number, r: number}>}
   */
  function hexNeighbors(q, r) {
    return DIRECTIONS.map(function (d) {
      return { q: q + d.q, r: r + d.r };
    });
  }

  /**
   * Get all hex cells in a ring at given radius
   * @param {number} cq - Center q
   * @param {number} cr - Center r
   * @param {number} radius
   * @returns {Array<{q: number, r: number}>}
   */
  function hexRing(cq, cr, radius) {
    if (radius === 0) return [{ q: cq, r: cr }];
    var results = [];
    var hex = { q: cq + DIRECTIONS[4].q * radius, r: cr + DIRECTIONS[4].r * radius };
    for (var i = 0; i < 6; i++) {
      for (var j = 0; j < radius; j++) {
        results.push({ q: hex.q, r: hex.r });
        hex = { q: hex.q + DIRECTIONS[i].q, r: hex.r + DIRECTIONS[i].r };
      }
    }
    return results;
  }

  /**
   * Get all hex cells within a given radius (filled circle)
   * @param {number} cq - Center q
   * @param {number} cr - Center r
   * @param {number} radius
   * @returns {Array<{q: number, r: number}>}
   */
  function hexRange(cq, cr, radius) {
    var results = [];
    for (var dq = -radius; dq <= radius; dq++) {
      for (var dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
        results.push({ q: cq + dq, r: cr + dr });
      }
    }
    return results;
  }

  /**
   * Create a hex key string for use in maps/sets
   * @param {number} q
   * @param {number} r
   * @returns {string}
   */
  function hexKey(q, r) {
    return q + ',' + r;
  }

  /**
   * Parse a hex key string back to coordinates
   * @param {string} key
   * @returns {{q: number, r: number}}
   */
  function parseHexKey(key) {
    var parts = key.split(',');
    return { q: parseInt(parts[0], 10), r: parseInt(parts[1], 10) };
  }

  return {
    hexToPixel: hexToPixel,
    pixelToHex: pixelToHex,
    hexRound: hexRound,
    hexCorners: hexCorners,
    hexDistance: hexDistance,
    hexNeighbors: hexNeighbors,
    hexRing: hexRing,
    hexRange: hexRange,
    hexKey: hexKey,
    parseHexKey: parseHexKey,
    DIRECTIONS: DIRECTIONS,
    SQRT3: SQRT3
  };
})();
