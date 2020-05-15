'use strict';

/**
 * @file uptimeping.test.js
 * @description Tests for uptimeping: Pinger, Stats, Monitor.
 * @author idirdev
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { Pinger, Stats, Monitor, createMonitor, ping } = require('../src/index.js');

// ---------------------------------------------------------------------------
// Local test server
// ---------------------------------------------------------------------------

let server;
let baseUrl;

before(() => new Promise((resolve) => {
  server = http.createServer((req, res) => {
    if (req.url === '/slow') {
      return setTimeout(() => { res.writeHead(200); res.end('slow'); }, 200);
    }
    if (req.url === '/fail') {
      res.writeHead(500); return res.end('error');
    }
    if (req.url === '/redirect') {
      res.writeHead(301, { Location: baseUrl + '/' }); return res.end();
    }
    res.writeHead(200); res.end('ok');
  });
  server.listen(0, '127.0.0.1', () => {
    baseUrl = 'http://127.0.0.1:' + server.address().port;
    resolve();
  });
}));

after(() => new Promise((resolve) => server.close(resolve)));

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe('Stats', () => {
  it('starts with zero values', () => {
    const s = new Stats();
    assert.equal(s.total, 0);
    assert.equal(s.success, 0);
    assert.equal(s.fail, 0);
    assert.equal(s.min, null);
    assert.equal(s.max, null);
    assert.equal(s.avg, 0);
    assert.equal(s.uptime, 0);
  });

  it('records a successful ping', () => {
    const s = new Stats();
    s.record(true, 100);
    assert.equal(s.total, 1);
    assert.equal(s.success, 1);
    assert.equal(s.fail, 0);
    assert.equal(s.min, 100);
    assert.equal(s.max, 100);
    assert.equal(s.avg, 100);
    assert.equal(s.uptime, 100);
  });

  it('records a failed ping', () => {
    const s = new Stats();
    s.record(false, null);
    assert.equal(s.total, 1);
    assert.equal(s.success, 0);
    assert.equal(s.fail, 1);
    assert.equal(s.avg, 0);
  });

  it('calculates correct min/max/avg across multiple pings', () => {
    const s = new Stats();
    s.record(true, 50);
    s.record(true, 100);
    s.record(true, 150);
    assert.equal(s.min, 50);
    assert.equal(s.max, 150);
    assert.equal(s.avg, 100);
    assert.equal(s.uptime, 100);
  });

  it('calculates correct uptime percentage with mixed results', () => {
    const s = new Stats();
    s.record(true, 80);
    s.record(false, null);
    s.record(true, 120);
    s.record(false, null);
    assert.equal(s.total, 4);
    assert.equal(s.success, 2);
    assert.equal(s.uptime, 50);
  });

  it('resets all counters', () => {
    const s = new Stats();
    s.record(true, 100);
    s.reset();
    assert.equal(s.total, 0);
    assert.equal(s.avg, 0);
    assert.equal(s.min, null);
  });

  it('toJSON returns a plain object snapshot', () => {
    const s = new Stats();
    s.record(true, 75);
    const j = s.toJSON();
    assert.equal(typeof j, 'object');
    assert.equal(j.total, 1);
    assert.equal(j.avg, 75);
    assert.equal(j.uptime, 100);
  });
});

// ---------------------------------------------------------------------------
// Pinger
// ---------------------------------------------------------------------------

describe('Pinger', () => {
  it('pings a healthy endpoint successfully', async () => {
    const pinger = new Pinger({ timeout: 3000 });
    const result = await pinger.ping(baseUrl + '/');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.ok(result.ms >= 0);
    assert.equal(result.error, null);
  });

  it('returns ok=false for HTTP 500', async () => {
    const pinger = new Pinger({ timeout: 3000 });
    const result = await pinger.ping(baseUrl + '/fail');
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
  });

  it('follows redirects by default', async () => {
    const pinger = new Pinger({ timeout: 3000 });
    const result = await pinger.ping(baseUrl + '/redirect');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
  });

  it('times out when server is too slow', async () => {
    const pinger = new Pinger({ timeout: 50 });
    const result = await pinger.ping(baseUrl + '/slow');
    assert.equal(result.ok, false);
    assert.match(result.error, /timeout/i);
  });

  it('returns error for invalid URL', async () => {
    const pinger = new Pinger();
    const result = await pinger.ping('not-a-url');
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  it('returns error for unreachable host', async () => {
    const pinger = new Pinger({ timeout: 500 });
    const result = await pinger.ping('http://127.0.0.1:1');
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });
});

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

describe('Monitor', () => {
  it('addTarget throws on duplicate URL', () => {
    const mon = createMonitor({ interval: 999999 });
    mon.addTarget(baseUrl);
    assert.throws(() => mon.addTarget(baseUrl), /already monitored/);
    mon.stop();
  });

  it('removeTarget returns false for unknown URL', () => {
    const mon = createMonitor();
    assert.equal(mon.removeTarget('http://not-there.invalid'), false);
  });

  it('emits result event on start', () => new Promise((resolve) => {
    const mon = createMonitor({ interval: 999999, timeout: 3000 });
    mon.addTarget(baseUrl + '/');
    mon.once('result', (r) => {
      assert.ok(r.url);
      assert.equal(typeof r.ok, 'boolean');
      mon.stop();
      resolve();
    });
    mon.start();
  }));

  it('getStats returns entries for all targets', () => {
    const mon = createMonitor({ interval: 999999 });
    mon.addTarget(baseUrl + '/');
    const stats = mon.getStats();
    assert.equal(stats.length, 1);
    assert.equal(stats[0].url, baseUrl + '/');
    mon.stop();
  });

  it('removeTarget removes it from getStats', () => {
    const mon = createMonitor({ interval: 999999 });
    mon.addTarget(baseUrl + '/');
    mon.removeTarget(baseUrl + '/');
    assert.equal(mon.getStats().length, 0);
  });
});

// ---------------------------------------------------------------------------
// Top-level ping()
// ---------------------------------------------------------------------------

describe('ping()', () => {
  it('pings a URL directly', async () => {
    const result = await ping(baseUrl + '/');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
  });

  it('accepts timeout option', async () => {
    const result = await ping(baseUrl + '/slow', { timeout: 50 });
    assert.equal(result.ok, false);
  });
});
