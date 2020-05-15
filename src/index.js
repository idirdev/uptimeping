'use strict';

/**
 * @module uptimeping
 * @description Uptime monitor that pings HTTP(S) endpoints and tracks
 *              availability statistics over time.
 * @author idirdev
 */

const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Tracks response-time statistics for a single monitored target.
 */
class Stats {
  constructor() {
    /** @type {number} Total number of pings attempted */
    this.total = 0;
    /** @type {number} Number of successful pings */
    this.success = 0;
    /** @type {number} Number of failed pings */
    this.fail = 0;
    /** @type {number|null} Minimum response time in ms */
    this.min = null;
    /** @type {number|null} Maximum response time in ms */
    this.max = null;
    /** @type {number} Cumulative response time for average calculation */
    this._sum = 0;
  }

  /**
   * Records the result of a single ping attempt.
   * @param {boolean} ok - Whether the ping succeeded.
   * @param {number|null} ms - Response time in milliseconds, or null on failure.
   * @returns {void}
   */
  record(ok, ms) {
    this.total++;
    if (ok && ms !== null) {
      this.success++;
      this._sum += ms;
      if (this.min === null || ms < this.min) this.min = ms;
      if (this.max === null || ms > this.max) this.max = ms;
    } else {
      this.fail++;
    }
  }

  /**
   * Returns the average response time in milliseconds.
   * @returns {number} Average ms, or 0 if no successful pings.
   */
  get avg() {
    return this.success > 0 ? Math.round(this._sum / this.success) : 0;
  }

  /**
   * Returns the uptime percentage (0–100).
   * @returns {number} Uptime percentage rounded to 2 decimal places.
   */
  get uptime() {
    return this.total > 0 ? parseFloat(((this.success / this.total) * 100).toFixed(2)) : 0;
  }

  /**
   * Returns a plain-object snapshot of current stats.
   * @returns {{ total: number, success: number, fail: number, min: number|null, max: number|null, avg: number, uptime: number }}
   */
  toJSON() {
    return {
      total: this.total,
      success: this.success,
      fail: this.fail,
      min: this.min,
      max: this.max,
      avg: this.avg,
      uptime: this.uptime,
    };
  }

  /** Resets all counters to their initial state. */
  reset() {
    this.total = 0;
    this.success = 0;
    this.fail = 0;
    this.min = null;
    this.max = null;
    this._sum = 0;
  }
}

// ---------------------------------------------------------------------------
// Pinger
// ---------------------------------------------------------------------------

/**
 * Performs a single HTTP/HTTPS ping against a URL and measures response time.
 */
class Pinger {
  /**
   * @param {object} [opts={}] - Pinger options.
   * @param {number} [opts.timeout=5000] - Request timeout in milliseconds.
   * @param {string} [opts.method='GET'] - HTTP method.
   * @param {boolean} [opts.followRedirects=true] - Whether to follow 3xx redirects.
   */
  constructor(opts = {}) {
    this.timeout = opts.timeout ?? 5000;
    this.method = opts.method ?? 'GET';
    this.followRedirects = opts.followRedirects !== false;
    this._redirectLimit = 5;
  }

  /**
   * Pings the given URL and resolves with a result object.
   * @param {string} url - The URL to ping.
   * @param {number} [redirectCount=0] - Internal redirect counter.
   * @returns {Promise<{ url: string, status: number|null, ok: boolean, ms: number, error: string|null }>}
   * @example
   * const pinger = new Pinger({ timeout: 3000 });
   * const result = await pinger.ping('https://example.com');
   * console.log(result.ms, result.status);
   */
  ping(url, redirectCount = 0) {
    return new Promise((resolve) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return resolve({ url, status: null, ok: false, ms: 0, error: 'Invalid URL' });
      }

      const transport = parsed.protocol === 'https:' ? https : http;
      const start = Date.now();

      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: this.method,
          timeout: this.timeout,
          headers: { 'User-Agent': 'uptimeping/1.0' },
          rejectUnauthorized: false,
        },
        (res) => {
          const ms = Date.now() - start;
          res.resume(); // drain body

          if (
            this.followRedirects &&
            redirectCount < this._redirectLimit &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            req.destroy();
            return resolve(this.ping(res.headers.location, redirectCount + 1));
          }

          const ok = res.statusCode >= 200 && res.statusCode < 400;
          resolve({ url, status: res.statusCode, ok, ms, error: null });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve({ url, status: null, ok: false, ms: this.timeout, error: 'Timeout' });
      });

      req.on('error', (err) => {
        const ms = Date.now() - start;
        resolve({ url, status: null, ok: false, ms, error: err.message });
      });

      req.end();
    });
  }
}

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

/**
 * Manages continuous monitoring of multiple HTTP/HTTPS targets.
 * Emits events: 'result', 'up', 'down', 'error'.
 * @extends EventEmitter
 */
class Monitor extends EventEmitter {
  /**
   * @param {object} [config={}] - Monitor configuration.
   * @param {number} [config.interval=60000] - Poll interval in milliseconds.
   * @param {number} [config.timeout=5000] - Per-request timeout in milliseconds.
   * @example
   * const mon = new Monitor({ interval: 30000 });
   * mon.addTarget('https://example.com');
   * mon.on('result', r => console.log(r));
   * mon.start();
   */
  constructor(config = {}) {
    super();
    this.interval = config.interval ?? 60000;
    this.timeout = config.timeout ?? 5000;
    this._targets = new Map(); // url -> { pinger, stats, timer, lastOk }
    this._running = false;
  }

  /**
   * Adds a target URL to the monitor.
   * @param {string} url - The URL to monitor.
   * @returns {void}
   * @throws {Error} If the URL is already being monitored.
   */
  addTarget(url) {
    if (this._targets.has(url)) throw new Error('Target already monitored: ' + url);
    const pinger = new Pinger({ timeout: this.timeout });
    const stats = new Stats();
    this._targets.set(url, { pinger, stats, timer: null, lastOk: null });
    if (this._running) this._scheduleTarget(url);
  }

  /**
   * Removes a target URL from the monitor and clears its timer.
   * @param {string} url - The URL to remove.
   * @returns {boolean} True if removed, false if not found.
   */
  removeTarget(url) {
    const entry = this._targets.get(url);
    if (!entry) return false;
    if (entry.timer) clearInterval(entry.timer);
    this._targets.delete(url);
    return true;
  }

  /**
   * Starts polling all registered targets.
   * @returns {void}
   */
  start() {
    if (this._running) return;
    this._running = true;
    for (const url of this._targets.keys()) {
      this._scheduleTarget(url);
    }
  }

  /**
   * Stops all polling timers and marks the monitor as stopped.
   * @returns {void}
   */
  stop() {
    this._running = false;
    for (const entry of this._targets.values()) {
      if (entry.timer) clearInterval(entry.timer);
      entry.timer = null;
    }
  }

  /**
   * Returns a snapshot of stats for all monitored targets.
   * @returns {Array<{ url: string, stats: object }>}
   */
  getStats() {
    const out = [];
    for (const [url, entry] of this._targets) {
      out.push({ url, stats: entry.stats.toJSON() });
    }
    return out;
  }

  /** @private */
  _scheduleTarget(url) {
    const entry = this._targets.get(url);
    if (!entry) return;
    const run = async () => {
      const result = await entry.pinger.ping(url);
      entry.stats.record(result.ok, result.ok ? result.ms : null);
      result.stats = entry.stats.toJSON();
      this.emit('result', result);
      if (result.ok && entry.lastOk === false) this.emit('up', result);
      if (!result.ok && entry.lastOk === true) this.emit('down', result);
      entry.lastOk = result.ok;
    };
    run();
    entry.timer = setInterval(run, this.interval);
  }
}

// ---------------------------------------------------------------------------
// Module API
// ---------------------------------------------------------------------------

/**
 * Creates a new Monitor with the given configuration.
 * @param {object} [config={}] - Monitor configuration (see Monitor constructor).
 * @returns {Monitor}
 * @example
 * const monitor = createMonitor({ interval: 30000 });
 * monitor.addTarget('https://example.com');
 * monitor.start();
 */
function createMonitor(config = {}) {
  return new Monitor(config);
}

/**
 * Performs a one-shot ping against a URL.
 * @param {string} url - The URL to ping.
 * @param {object} [opts={}] - Options forwarded to Pinger constructor.
 * @returns {Promise<{ url: string, status: number|null, ok: boolean, ms: number, error: string|null }>}
 * @example
 * const result = await ping('https://example.com', { timeout: 3000 });
 */
function ping(url, opts = {}) {
  return new Pinger(opts).ping(url);
}

module.exports = { createMonitor, ping, Monitor, Pinger, Stats };
