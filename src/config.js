'use strict';
const fs = require('fs');
const path = require('path');

function loadConfig(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new Error('Config not found: ' + resolved);
  const content = fs.readFileSync(resolved, 'utf8');
  if (resolved.endsWith('.json')) return JSON.parse(content);
  return content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(url => ({ url, name: url }));
}

function parseTarget(input) {
  if (typeof input === 'string') return { url: input, name: input, interval: 30000, timeout: 5000 };
  return { url: input.url, name: input.name || input.url, interval: input.interval || 30000, timeout: input.timeout || 5000 };
}

module.exports = { loadConfig, parseTarget };
