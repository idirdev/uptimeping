'use strict';

const { Pinger } = require('./pinger');

class Monitor {
  constructor(target, stats, reporter, maxCount) {
    this.target = target;
    this.stats = stats;
    this.reporter = reporter;
    this.maxCount = maxCount || 0; // 0 = infinite
    this.running = false;
    this.timer = null;
    this.history = [];
    this.lastAlive = null;
  }

  async start() {
    this.running = true;

    // Run first ping immediately
    await this._doPing();

    // If count is 1 (single check), stop here
    if (this.maxCount === 1) {
      this.running = false;
      return;
    }

    // Continuous loop
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._scheduleNext();
    });
  }

  _scheduleNext() {
    if (!this.running) {
      if (this._resolve) this._resolve();
      return;
    }

    const interval = this.target.interval || 5000;
    this.timer = setTimeout(async () => {
      if (!this.running) {
        if (this._resolve) this._resolve();
        return;
      }

      await this._doPing();

      // Check if we reached max count
      if (this.maxCount > 0 && this.stats.totalPings >= this.maxCount) {
        this.running = false;
        if (this._resolve) this._resolve();
        return;
      }

      this._scheduleNext();
    }, interval);
  }

  async _doPing() {
    const result = await Pinger.ping(this.target);
    this.stats.record(result);

    // Store in history (keep last 1000)
    this.history.push({
      timestamp: result.timestamp,
      alive: result.alive,
      responseTime: result.responseTime,
      statusCode: result.statusCode,
      error: result.error,
    });
    if (this.history.length > 1000) {
      this.history.shift();
    }

    // Detect status change
    if (this.lastAlive !== null && this.lastAlive !== result.alive) {
      const from = this.lastAlive ? 'up' : 'down';
      const to = result.alive ? 'up' : 'down';
      this.reporter.printStatusChange(this.target, from, to, result);
    }
    this.lastAlive = result.alive;

    // Print result
    this.reporter.printPingResult(this.target, result, this.stats);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this._resolve) {
      this._resolve();
      this._resolve = null;
    }
  }
}

module.exports = { Monitor };
