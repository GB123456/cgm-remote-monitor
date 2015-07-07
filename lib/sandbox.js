'use strict';

var _ = require('lodash');
var units = require('./units')();
var profile = require('./profilefunctions')();

function init ( ) {
  var sbx = {};

  function reset () {
    sbx.properties = [];
    sbx.scaleBg = scaleBg;
    sbx.displayBg = displayBg;
    sbx.roundInsulinForDisplayFormat = roundInsulinForDisplayFormat;
    sbx.roundBGToDisplayFormat = roundBGToDisplayFormat;
  }

  function extend () {
    sbx.unitsLabel = unitsLabel();
    sbx.data = sbx.data || {};
    //default to prevent adding checks everywhere
    sbx.extendedSettings = {empty: true};
  }

  function withExtendedSettings(plugin, allExtendedSettings, sbx) {
    var sbx2 = _.extend({}, sbx);
    sbx2.extendedSettings = allExtendedSettings[plugin.name] || {};
    return sbx2;
  }

  /**
   * Initialize the sandbox using server state
   *
   * @param env - .js
   * @param ctx - created from bootevent
   * @returns {{sbx}}
   */
  sbx.serverInit = function serverInit (env, ctx) {
    reset();

    sbx.time = Date.now();
    sbx.units = env.DISPLAY_UNITS;
    sbx.defaults = env.defaults;
    sbx.enable = env.enable;
    sbx.thresholds = env.thresholds;
    sbx.alarm_types = env.alarm_types;
    sbx.data = ctx.data.clone();

    //don't expose all of notifications, ctx.notifications will decide what to do after all plugins chime in
    sbx.notifications = _.pick(ctx.notifications, ['levels', 'requestNotify', 'requestSnooze', 'requestClear']);

    //Plugins will expect the right profile based on time
    profile.loadData(ctx.data.profiles);
    sbx.data.profile = profile;
    delete sbx.data.profiles;

    sbx.properties = [];

    sbx.withExtendedSettings = function getPluginExtendedSettingsOnly (plugin) {
      return withExtendedSettings(plugin, env.extendedSettings, sbx);
    };

    extend();

    return sbx;
  };

  /**
   * Initialize the sandbox using client state
   *
   * @param app - app settings
   * @param clientSettings - specific settings from the client, starting with the defaults
   * @param time - could be a retro time
   * @param pluginBase - used by visualization plugins to update the UI
   * @param data - svgs, treatments, profile, etc
   * @returns {{sbx}}
   */
  sbx.clientInit = function clientInit (app, clientSettings, time, pluginBase, data) {
    reset();

    sbx.units = clientSettings.units;
    sbx.defaults = clientSettings; //TODO: strip out extra stuff
    sbx.thresholds = app.thresholds;
    sbx.enable = app.enabledOptions;
    sbx.alarm_types = clientSettings.alarm_types;
    sbx.showPlugins = clientSettings.showPlugins;
    sbx.time = time;
    sbx.data = data;
    sbx.pluginBase = pluginBase;

    sbx.extendedSettings = {empty: true};
    sbx.withExtendedSettings = function getPluginExtendedSettingsOnly (plugin) {
      return withExtendedSettings(plugin, app.extendedSettings, sbx);
    };

    extend();

    return sbx;
  };

  /**
   * Properties are immutable, first plugin to set it wins, plugins should be in the correct order
   *
   * @param name
   * @param setter
   */
  sbx.offerProperty = function offerProperty (name, setter) {
    if (!sbx.properties.hasOwnProperty(name)) {
      var value = setter();
      if (value) {
        sbx.properties[name] = value;
      }
    }
  };

  sbx.lastEntry = function lastEntry (entries) {
    return _.findLast(entries, function notInTheFuture (entry) {
      return sbx.entryMills(entry) <= sbx.time;
    });
  };

  sbx.lastSGVEntry = function lastSGVEntry ( ) {
    return sbx.lastEntry(sbx.data.sgvs);
  };

  sbx.lastSGV = function lastSGV ( ) {
    var last = sbx.lastSGVEntry();
    return last && last.y;
  };

  sbx.lastSGVMills = function lastSGVMills ( ) {
    return sbx.entryMills(sbx.lastSGVEntry());
  };

  sbx.entryMills = function entryMills(entry) {
    //FIXME: field mismatch between server and client :(
    return (entry && entry.x) || (entry && entry.date && (new Date(entry.date)).getTime()) || 0;
  };

  sbx.lastScaledSGV = function lastScaledSVG ( ) {
    return sbx.scaleBg(sbx.lastSGV());
  };

  sbx.lastDisplaySVG = function lastDisplaySVG ( ) {
    return sbx.displayBg(sbx.lastSGV());
  };

  sbx.buildBGNowLine = function buildBGNowLine ( ) {
    var line = 'BG Now: ' + sbx.lastDisplaySVG();

    var delta = sbx.properties.delta && sbx.properties.delta.display;
    if (delta) {
      line += ' ' + delta;
    }

    var direction = sbx.properties.direction && sbx.properties.direction.label;
    if (direction) {
      line += ' ' + direction;
    }

    line += ' ' + sbx.unitsLabel;

    return line;
  };

  sbx.propertyLine = function propertyLine (propertyName) {
    return sbx.properties[propertyName] && sbx.properties[propertyName].displayLine;
  };

  sbx.appendPropertyLine = function appendPropertyLine (propertyName, lines) {
    lines = lines || [];

    var displayLine = sbx.propertyLine(propertyName);
    if (displayLine) {
      lines.push(displayLine);
    }

    return lines;
  };

  sbx.prepareDefaultLines = function prepareDefaultLines() {
    var lines = [sbx.buildBGNowLine()];
    sbx.appendPropertyLine('rawbg', lines);
    sbx.appendPropertyLine('ar2', lines);
    sbx.appendPropertyLine('bwp', lines);
    sbx.appendPropertyLine('iob', lines);
    sbx.appendPropertyLine('cob', lines);

    return lines;
  };

  sbx.buildDefaultMessage = function buildDefaultMessage() {
    return sbx.prepareDefaultLines().join('\n');
  };

  function displayBg (bg) {
    if (Number(bg) === 39) {
      return 'LOW';
    } else if (Number(bg) === 401) {
      return 'HIGH';
    } else {
      return scaleBg(bg);
    }
  }

  function scaleBg (bg) {
    if (sbx.units === 'mmol' && bg) {
      return Number(units.mgdlToMMOL(bg));
    } else {
      return Number(bg);
    }
  }

  function roundInsulinForDisplayFormat (insulin) {

    if (insulin === 0) {
      return '0';
    }

    if (sbx.properties.roundingStyle === 'medtronic') {
      var denominator = 0.1;
      var digits = 1;
      if (insulin > 0.5 && iob < 1) {
        denominator = 0.05;
        digits = 2;
      }
      if (insulin <= 0.5) {
        denominator = 0.025;
        digits = 3;
      }
      return (Math.floor(insulin / denominator) * denominator).toFixed(digits);
    }

    return (Math.floor(insulin / 0.01) * 0.01).toFixed(2);

  }

  function unitsLabel ( ) {
    return sbx.units === 'mmol' ? 'mmol/L' : 'mg/dl';
  }

  function roundBGToDisplayFormat (bg) {
    return sbx.units === 'mmol' ? Math.round(bg * 10) / 10 : Math.round(bg);
  }


  return sbx;
}

module.exports = init;
