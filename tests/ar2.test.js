var should = require('should');

describe('ar2', function ( ) {

  var ar2 = require('../lib/plugins/ar2')();
  var delta = require('../lib/plugins/delta')();

  var env = require('../env')();
  var ctx = {};
  ctx.data = require('../lib/data')(env, ctx);
  ctx.notifications = require('../lib/notifications')(env, ctx);

  var now = Date.now();
  var before = now - (5 * 60 * 1000);

  function prepareSandbox(base) {
    var sbx = base || require('../lib/sandbox')().serverInit(env, ctx);
    ar2.setProperties(sbx);
    delta.setProperties(sbx);
    return sbx;
  }

  function rawSandbox() {
    var envRaw = require('../env')();
    envRaw.extendedSettings = {'ar2': {useRaw: true}};

    var sbx = require('../lib/sandbox')().serverInit(envRaw, ctx).withExtendedSettings(ar2);

    sbx.offerProperty('rawbg', function setFakeRawBG() {
      return {};
    });

    return prepareSandbox(sbx);
  }

  it('Not trigger an alarm when in range', function (done) {
    ctx.notifications.initRequests();
    ctx.data.sgvs = [{y: 100, x: before}, {y: 105, x: now}];

    var sbx = prepareSandbox();
    ar2.checkNotifications(sbx);
    should.not.exist(ctx.notifications.findHighestAlarm());

    done();
  });

  it('should trigger a warning when going above target', function (done) {
    ctx.notifications.initRequests();
    ctx.data.sgvs = [{y: 150, x: before}, {y: 170, x: now}];

    var sbx = prepareSandbox();
    sbx.offerProperty('iob', function setFakeIOB() {
      return {displayLine: 'IOB: 1.25U'};
    });
    sbx.offerProperty('direction', function setFakeDirection() {
      return {value: 'FortyFiveUp', label: '↗', entity: '&#8599;'};
    });
    ar2.checkNotifications(sbx);
    var highest = ctx.notifications.findHighestAlarm();
    highest.level.should.equal(ctx.notifications.levels.WARN);
    highest.title.should.equal('Warning, HIGH predicted');
    highest.message.should.equal('BG Now: 170 +20 ↗ mg/dl\nBG 15m: 206 mg/dl\nIOB: 1.25U');

    done();
  });

  it('should trigger a urgent alarm when going high fast', function (done) {
    ctx.notifications.initRequests();
    ctx.data.sgvs = [{y: 140, x: before}, {y: 200, x: now}];

    var sbx = prepareSandbox();
    ar2.checkNotifications(sbx);
    var highest = ctx.notifications.findHighestAlarm();
    highest.level.should.equal(ctx.notifications.levels.URGENT);
    highest.title.should.equal('Urgent, HIGH');

    done();
  });

  it('should trigger a warning when below target', function (done) {
    ctx.notifications.initRequests();
    ctx.data.sgvs = [{y: 90, x: before}, {y: 80, x: now}];

    var sbx = prepareSandbox();
    ar2.checkNotifications(sbx);
    var highest = ctx.notifications.findHighestAlarm();
    highest.level.should.equal(ctx.notifications.levels.WARN);
    highest.title.should.equal('Warning, LOW');

    done();
  });

  it('should trigger a warning when almost below target', function (done) {
    ctx.notifications.initRequests();
    ctx.data.sgvs = [{y: 90, x: before}, {y: 83, x: now}];

    var sbx = prepareSandbox();
    ar2.checkNotifications(sbx);
    var highest = ctx.notifications.findHighestAlarm();
    highest.level.should.equal(ctx.notifications.levels.WARN);
    highest.title.should.equal('Warning, LOW predicted');

    done();
  });

  it('should trigger a urgent alarm when falling fast', function (done) {
    ctx.notifications.initRequests();
    ctx.data.sgvs = [{y: 120, x: before}, {y: 85, x: now}];

    var sbx = prepareSandbox();
    ar2.checkNotifications(sbx);
    var highest = ctx.notifications.findHighestAlarm();
    highest.level.should.equal(ctx.notifications.levels.URGENT);
    highest.title.should.equal('Urgent, LOW predicted');

    done();
  });

  it('should include current raw bg and raw bg forecast when predicting w/raw', function (done) {
    ctx.notifications.initRequests();
    ctx.data.sgvs = [{unfiltered: 113680, filtered: 111232, y: 100, x: before, noise: 1}, {unfiltered: 183680, filtered: 111232, y: 100, x: now, noise: 1}];
    ctx.data.cals = [{scale: 1, intercept: 25717.82377004309, slope: 766.895601715918, x: now}];

    var envRaw = require('../env')();
    envRaw.extendedSettings = {'ar2': {useRaw: true}};

    var sbx = require('../lib/sandbox')().serverInit(envRaw, ctx).withExtendedSettings(ar2);

    sbx.offerProperty('rawbg', function setFakeIOB() {
      return {displayLine: 'Raw BG: 200 mg/dl Clean'};
    });
    sbx.offerProperty('iob', function setFakeIOB() {
      return {displayLine: 'IOB: 1.25U'};
    });
    sbx.offerProperty('direction', function setFakeDirection() {
      return {value: 'FortyFiveUp', label: '↗', entity: '&#8599;'};
    });

    sbx = prepareSandbox(sbx);

    ar2.checkNotifications(sbx.withExtendedSettings(ar2));

    var highest = ctx.notifications.findHighestAlarm();
    highest.level.should.equal(ctx.notifications.levels.WARN);
    highest.title.should.equal('Warning, HIGH predicted w/raw');
    highest.message.should.equal('BG Now: 100 +0 ↗ mg/dl\nRaw BG: 200 mg/dl Clean\nRaw BG 15m: 400 mg/dl\nIOB: 1.25U');

    done();
  });

  it('should not trigger an alarm when raw is missing or 0', function (done) {
    ctx.notifications.initRequests();
    ctx.data.sgvs = [{unfiltered: 0, filtered: 0, y: 100, x: before, noise: 1}, {unfiltered: 0, filtered: 0, y: 100, x: now, noise: 1}];
    ctx.data.cals = [{scale: 1, intercept: 25717.82377004309, slope: 766.895601715918, x: now}];

    var sbx = rawSandbox();
    ar2.checkNotifications(sbx.withExtendedSettings(ar2));
    should.not.exist(ctx.notifications.findHighestAlarm());

    done();
  });


  it('should trigger a warning (no urgent for raw) when raw is falling really fast, but sgv is steady', function (done) {
    ctx.notifications.initRequests();
    ctx.data.sgvs = [{unfiltered: 113680, filtered: 111232, y: 100, x: before, noise: 1}, {unfiltered: 43680, filtered: 111232, y: 100, x: now, noise: 1}];
    ctx.data.cals = [{scale: 1, intercept: 25717.82377004309, slope: 766.895601715918, x: now}];

    var sbx = rawSandbox();
    sbx.offerProperty('rawbg', function setFakeIOB() {
      return {};
    });

    ar2.checkNotifications(sbx.withExtendedSettings(ar2));
    var highest = ctx.notifications.findHighestAlarm();
    highest.level.should.equal(ctx.notifications.levels.WARN);
    highest.title.should.equal('Warning, LOW predicted w/raw');

    done();
  });

  it('should trigger a warning (no urgent for raw) when raw is rising really fast, but sgv is steady', function (done) {
    ctx.notifications.initRequests();
    ctx.data.sgvs = [{unfiltered: 113680, filtered: 111232, y: 100, x: before, noise: 1}, {unfiltered: 183680, filtered: 111232, y: 100, x: now, noise: 1}];
    ctx.data.cals = [{scale: 1, intercept: 25717.82377004309, slope: 766.895601715918, x: now}];

    var sbx = rawSandbox();
    sbx.offerProperty('rawbg', function setFakeIOB() {
      return {};
    });

    ar2.checkNotifications(sbx.withExtendedSettings(ar2));
    var highest = ctx.notifications.findHighestAlarm();
    highest.level.should.equal(ctx.notifications.levels.WARN);
    highest.title.should.equal('Warning, HIGH predicted w/raw');

    done();
  });

});