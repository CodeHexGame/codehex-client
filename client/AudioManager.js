/**
 * AudioManager.js — Sound effects and background music
 * Dependencies: none
 * Lazy-loads audio on demand. Volume stored in localStorage.
 */

// eslint-disable-next-line no-unused-vars
var AudioManager = (function () {
  'use strict';

  var bgMusic = null;
  var scenarioPublic = null;

  var musicEnabled = true;
  var soundEnabled = true;
  var musicVolume = 0.3;
  var soundVolume = 0.7;

  // Load saved preferences from localStorage
  function loadPreferences() {
    try {
      var prefs = JSON.parse(localStorage.getItem('codehex_audio') || '{}');
      if (prefs.musicEnabled !== undefined) musicEnabled = prefs.musicEnabled;
      if (prefs.soundEnabled !== undefined) soundEnabled = prefs.soundEnabled;
      if (prefs.musicVolume !== undefined) musicVolume = prefs.musicVolume;
      if (prefs.soundVolume !== undefined) soundVolume = prefs.soundVolume;
    } catch (e) {
      // Ignore
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem('codehex_audio', JSON.stringify({
        musicEnabled: musicEnabled,
        soundEnabled: soundEnabled,
        musicVolume: musicVolume,
        soundVolume: soundVolume
      }));
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Initialize with scenario data
   * @param {object} sp - scenarioPublic
   */
  function init(sp) {
    scenarioPublic = sp;
    loadPreferences();
  }

  /**
   * Play a sound effect by name
   * @param {string} name - Sound name from scenarioPublic.audio.sounds
   */
  function playSound(name) {
    if (!soundEnabled || !scenarioPublic) return;
    if (!scenarioPublic.audio || !scenarioPublic.audio.sounds) return;
    var file = scenarioPublic.audio.sounds[name];
    if (!file) return;

    var url = (scenarioPublic.audioBaseUrl || '') + file;
    var audio = new Audio(url);
    audio.volume = soundVolume;
    audio.play().catch(function () {
      // Browser may block autoplay
    });
  }

  /**
   * Start background music (random track, looped)
   */
  function startMusic() {
    if (!musicEnabled || !scenarioPublic) return;
    if (!scenarioPublic.audio || !scenarioPublic.audio.music) return;
    var tracks = scenarioPublic.audio.music;
    if (tracks.length === 0) return;

    stopMusic();

    var track = tracks[Math.floor(Math.random() * tracks.length)];
    var url = (scenarioPublic.audioBaseUrl || '') + track;
    bgMusic = new Audio(url);
    bgMusic.loop = true;
    bgMusic.volume = musicVolume;
    bgMusic.play().catch(function () {
      // Browser may block autoplay
    });

    // When track ends and loop fails, try next
    bgMusic.addEventListener('error', function () {
      bgMusic = null;
    });
  }

  /**
   * Stop background music
   */
  function stopMusic() {
    if (bgMusic) {
      bgMusic.pause();
      bgMusic.src = '';
      bgMusic = null;
    }
  }

  /**
   * Toggle music on/off
   * @returns {boolean} New state
   */
  function toggleMusic() {
    musicEnabled = !musicEnabled;
    if (musicEnabled) {
      startMusic();
    } else {
      stopMusic();
    }
    savePreferences();
    return musicEnabled;
  }

  /**
   * Toggle sound effects on/off
   * @returns {boolean} New state
   */
  function toggleSound() {
    soundEnabled = !soundEnabled;
    savePreferences();
    return soundEnabled;
  }

  /**
   * Set music volume (0..1)
   */
  function setMusicVolume(vol) {
    musicVolume = Math.max(0, Math.min(1, vol));
    if (bgMusic) bgMusic.volume = musicVolume;
    savePreferences();
  }

  /**
   * Set sound volume (0..1)
   */
  function setSoundVolume(vol) {
    soundVolume = Math.max(0, Math.min(1, vol));
    savePreferences();
  }

  return {
    init: init,
    playSound: playSound,
    startMusic: startMusic,
    stopMusic: stopMusic,
    toggleMusic: toggleMusic,
    toggleSound: toggleSound,
    setMusicVolume: setMusicVolume,
    setSoundVolume: setSoundVolume,
    get musicEnabled() { return musicEnabled; },
    get soundEnabled() { return soundEnabled; },
    get musicVolume() { return musicVolume; },
    get soundVolume() { return soundVolume; }
  };
})();
