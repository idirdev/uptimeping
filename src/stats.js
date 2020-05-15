'use strict';

class StatsCollector {
  constructor() {
    this.responseTimes = [];
    this.totalPings = 0;
    this.successCount = 0;
    this.failCount = 0;
    this.startTime = null;
    this.lastStatus = null;
    this.statusChanges = [];
  }

  record(result) {
    if (!this.startTime) {
      this.startTime = new Date();
    }

    this.totalPings++;

    if (result.alive) {
      this.successCount++;
      this.responseTimes.push(result.responseTime);
    } else {
      this.failCount++;
    }

    // Track status changes
    const newStatus = result.alive ? 'up' : 'down';
    if (this.lastStatus !== null && this.lastStatus !== newStatus) {
      this.statusChanges.push({
        from: this.lastStatus,
        to: newStatus,
        timestamp: result.timestamp,
        pingNumber: this.totalPings,
      });
    }
    this.lastStatus = newStatus;
  }

  getMin() {
    if (this.responseTimes.length === 0) return 0;
    return Math.min(...this.responseTimes);
  }

  getMax() {
    if (this.responseTimes.length === 0) return 0;
    return Math.max(...this.responseTimes);
  }

  getAvg() {
    if (this.responseTimes.length === 0) return 0;
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return Math.round((sum / this.responseTimes.length) * 100) / 100;
  }

  getMedian() {
    if (this.responseTimes.length === 0) return 0;
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
    }
    return sorted[mid];
  }

  getPercentile(p) {
    if (this.responseTimes.length === 0) return 0;
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getP95() {
    return this.getPercentile(95);
  }

  getP99() {
    return this.getPercentile(99);
  }

  getUptimePercent() {
    if (this.totalPings === 0) return 0;
    return Math.round((this.successCount / this.totalPings) * 10000) / 100;
  }

  getElapsed() {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime.getTime();
  }

  getStdDev() {
    if (this.responseTimes.length < 2) return 0;
    const avg = this.getAvg();
    const squaredDiffs = this.responseTimes.map(t => Math.pow(t - avg, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    return Math.round(Math.sqrt(variance) * 100) / 100;
  }

  getSummary() {
    return {
      totalPings: this.totalPings,
      successful: this.successCount,
      failed: this.failCount,
      uptimePercent: this.getUptimePercent(),
      min: this.getMin(),
      max: this.getMax(),
      avg: this.getAvg(),
      median: this.getMedian(),
      p95: this.getP95(),
      p99: this.getP99(),
      stdDev: this.getStdDev(),
      elapsedMs: this.getElapsed(),
      statusChanges: this.statusChanges,
    };
  }

  reset() {
    this.responseTimes = [];
    this.totalPings = 0;
    this.successCount = 0;
    this.failCount = 0;
    this.startTime = null;
    this.lastStatus = null;
    this.statusChanges = [];
  }
}

/**
 * Stats - simplified stats class with direct property access.
 * Used by tests and CLI consumers.
 */
class Stats {
  constructor() {
    this.totalPings = 0;
    this.successes = 0;
    this.failures = 0;
    this.minTime = Infinity;
    this.maxTime = 0;
    this._sumTime = 0;
    this._countTime = 0;
    this.avgTime = 0;
  }

  record(result) {
    this.totalPings++;
    if (result.alive) {
      this.successes++;
      const t = result.responseTime || 0;
      if (t < this.minTime) this.minTime = t;
      if (t > this.maxTime) this.maxTime = t;
      this._sumTime += t;
      this._countTime++;
      this.avgTime = Math.round((this._sumTime / this._countTime) * 100) / 100;
    } else {
      this.failures++;
    }
  }

  reset() {
    this.totalPings = 0;
    this.successes = 0;
    this.failures = 0;
    this.minTime = Infinity;
    this.maxTime = 0;
    this._sumTime = 0;
    this._countTime = 0;
    this.avgTime = 0;
  }
}

module.exports = { StatsCollector, Stats };
