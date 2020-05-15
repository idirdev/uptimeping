'use strict';

const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns');
const { URL } = require('url');

class Pinger {
  static async httpPing(target) {
    const { url, timeout = 10000, method = 'GET', expect = 200 } = target;
    const start = process.hrtime.bigint();
    const timestamp = new Date();

    return new Promise((resolve) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(url.startsWith('http') ? url : 'http://' + url);
      } catch (err) {
        resolve({
          alive: false, responseTime: 0, statusCode: null,
          error: 'Invalid URL: ' + err.message, mode: 'http', timestamp,
        });
        return;
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;
      const defaultPort = isHttps ? 443 : 80;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || defaultPort,
        path: parsedUrl.pathname + parsedUrl.search,
        method: method.toUpperCase(),
        timeout,
        headers: {
          'User-Agent': 'uptimeping/1.0',
          'Accept': '*/*',
        },
        rejectUnauthorized: false,
      };

      const req = lib.request(options, (res) => {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        res.resume();
        res.on('end', () => {
          resolve({
            alive: res.statusCode === expect,
            responseTime: Math.round(elapsed * 100) / 100,
            statusCode: res.statusCode,
            error: res.statusCode !== expect
              ? 'Expected ' + expect + ', got ' + res.statusCode
              : null,
            mode: isHttps ? 'https' : 'http',
            timestamp,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({
          alive: false,
          responseTime: Math.round(elapsed * 100) / 100,
          statusCode: null,
          error: 'Timeout after ' + timeout + 'ms',
          mode: isHttps ? 'https' : 'http',
          timestamp,
        });
      });

      req.on('error', (err) => {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({
          alive: false,
          responseTime: Math.round(elapsed * 100) / 100,
          statusCode: null,
          error: err.message,
          mode: isHttps ? 'https' : 'http',
          timestamp,
        });
      });

      req.end();
    });
  }

  static async tcpPing(target) {
    const { url, port = 80, timeout = 10000 } = target;
    const start = process.hrtime.bigint();
    const timestamp = new Date();

    let hostname = url;
    try {
      const parsed = new URL(url.startsWith('http') ? url : 'http://' + url);
      hostname = parsed.hostname;
    } catch (_e) {
      // Use raw value as hostname
    }

    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);

      socket.on('connect', () => {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        socket.destroy();
        resolve({
          alive: true,
          responseTime: Math.round(elapsed * 100) / 100,
          statusCode: null, error: null, mode: 'tcp', timestamp,
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({
          alive: false,
          responseTime: Math.round(elapsed * 100) / 100,
          statusCode: null,
          error: 'TCP timeout after ' + timeout + 'ms',
          mode: 'tcp', timestamp,
        });
      });

      socket.on('error', (err) => {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({
          alive: false,
          responseTime: Math.round(elapsed * 100) / 100,
          statusCode: null, error: err.message, mode: 'tcp', timestamp,
        });
      });

      socket.connect(port, hostname);
    });
  }

  static async dnsPing(target) {
    const { url, timeout = 10000 } = target;
    const start = process.hrtime.bigint();
    const timestamp = new Date();

    let hostname = url;
    try {
      const parsed = new URL(url.startsWith('http') ? url : 'http://' + url);
      hostname = parsed.hostname;
    } catch (_e) {
      // Use raw value
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          alive: false, responseTime: timeout, statusCode: null,
          error: 'DNS timeout after ' + timeout + 'ms', mode: 'dns', timestamp,
        });
      }, timeout);

      dns.resolve4(hostname, (err, addresses) => {
        clearTimeout(timer);
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;

        if (err) {
          resolve({
            alive: false,
            responseTime: Math.round(elapsed * 100) / 100,
            statusCode: null, error: err.message, mode: 'dns', timestamp,
          });
        } else {
          resolve({
            alive: true,
            responseTime: Math.round(elapsed * 100) / 100,
            statusCode: null, error: null, mode: 'dns',
            address: addresses[0], timestamp,
          });
        }
      });
    });
  }

  static async ping(target) {
    const mode = (target.mode || 'http').toLowerCase();
    switch (mode) {
      case 'http':
      case 'https':
        return Pinger.httpPing(target);
      case 'tcp':
        return Pinger.tcpPing(target);
      case 'dns':
        return Pinger.dnsPing(target);
      default:
        return {
          alive: false, responseTime: 0, statusCode: null,
          error: 'Unknown ping mode: ' + mode, mode, timestamp: new Date(),
        };
    }
  }
}

module.exports = { Pinger };
