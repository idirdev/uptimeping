#!/usr/bin/env node
'use strict';

/**
 * @file cli.js
 * @description CLI for uptimeping — single ping or continuous watch mode.
 * @author idirdev
 */

const { ping, createMonitor } = require('../src/index.js');

const args = process.argv.slice(2);

function printHelp() {
  console.log([
    'Usage:',
    '  uptimeping <url>                    Single ping',
    '  uptimeping watch <url>              Continuous monitoring',
    '',
    'Options:',
    '  --interval <ms>   Watch interval in ms (default: 30000)',
    '  --timeout  <ms>   Request timeout in ms (default: 5000)',
    '  --json            Output results as JSON',
    '  --help            Show this help',
  ].join('\n'));
}

function parseArgs(argv) {
  const opts = { interval: 30000, timeout: 5000, json: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') { opts.json = true; continue; }
    if (argv[i] === '--help') { opts.help = true; continue; }
    if ((argv[i] === '--interval' || argv[i] === '--timeout') && argv[i + 1]) {
      opts[argv[i].slice(2)] = parseInt(argv[++i], 10);
      continue;
    }
    positional.push(argv[i]);
  }
  opts.positional = positional;
  return opts;
}

function formatResult(r, json) {
  if (json) return console.log(JSON.stringify(r));
  const status = r.ok ? 'UP  ' : 'DOWN';
  const code = r.status !== null ? r.status : '---';
  const ms = r.ok ? r.ms + 'ms' : (r.error || 'error');
  console.log('[' + status + '] ' + r.url + '  HTTP ' + code + '  ' + ms);
}

async function main() {
  const opts = parseArgs(args);
  if (opts.help || opts.positional.length === 0) return printHelp();

  const [cmd, urlArg] = opts.positional;

  if (cmd === 'watch') {
    if (!urlArg) { console.error('Error: URL required for watch command'); process.exit(1); }
    console.log('Watching ' + urlArg + ' every ' + opts.interval + 'ms  (Ctrl+C to stop)');
    const monitor = createMonitor({ interval: opts.interval, timeout: opts.timeout });
    monitor.addTarget(urlArg);
    monitor.on('result', (r) => formatResult(r, opts.json));
    monitor.on('down', (r) => console.error('!! DOWN: ' + r.url));
    monitor.on('up',   (r) => console.log('** RECOVERED: ' + r.url));
    monitor.start();
    process.on('SIGINT', () => { monitor.stop(); process.exit(0); });
    return;
  }

  // single ping — cmd is the URL
  const url = cmd;
  try {
    const result = await ping(url, { timeout: opts.timeout });
    formatResult(result, opts.json);
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
