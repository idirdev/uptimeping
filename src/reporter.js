'use strict';

const chalk = require('chalk');
const Table = require('cli-table3');

class Reporter {
  constructor(format) {
    this.format = format || 'table';
  }

  formatMs(ms) {
    if (ms < 1) return ms.toFixed(2) + 'ms';
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(2) + 's';
  }

  formatTimestamp(date) {
    return date.toLocaleTimeString('en-GB', { hour12: false });
  }

  statusIcon(alive) {
    return alive ? chalk.green('\u2713') : chalk.red('\u2717');
  }

  statusText(alive) {
    return alive ? chalk.green('UP') : chalk.red('DOWN');
  }

  printPingResult(target, result, stats) {
    if (this.format === 'json') {
      console.log(JSON.stringify({
        target: target.name,
        ...result,
        stats: stats ? stats.getSummary() : undefined,
      }));
      return;
    }

    if (this.format === 'minimal') {
      const icon = result.alive ? '+' : '-';
      const time = this.formatMs(result.responseTime);
      console.log(icon + ' ' + target.name + ' ' + time + (result.error ? ' [' + result.error + ']' : ''));
      return;
    }

    // Table format (default) - single line per ping
    const icon = this.statusIcon(result.alive);
    const status = this.statusText(result.alive);
    const time = this.formatMs(result.responseTime);
    const ts = this.formatTimestamp(result.timestamp);
    const code = result.statusCode ? chalk.gray(' [' + result.statusCode + ']') : '';
    const err = result.error ? chalk.red(' ' + result.error) : '';
    const count = stats ? chalk.gray(' #' + stats.totalPings) : '';

    console.log(
      '  ' + icon + ' ' + chalk.bold(target.name) + ' ' +
      status + ' ' + chalk.cyan(time) + code + err +
      count + chalk.gray(' ' + ts)
    );
  }

  printStatusChange(target, from, to, result) {
    const arrow = from === 'up'
      ? chalk.red('  \u26A0  DOWN') + chalk.gray(' \u2190 was UP')
      : chalk.green('  \u2713  UP') + chalk.gray(' \u2190 was DOWN');

    console.log('');
    console.log(chalk.bold.yellow('  STATUS CHANGE: ') + chalk.bold(target.name));
    console.log(arrow);
    if (result.error) {
      console.log(chalk.gray('     Reason: ') + chalk.red(result.error));
    }
    console.log('');
  }

  printSummary(monitorData) {
    if (this.format === 'json') {
      console.log(JSON.stringify(monitorData, null, 2));
      return;
    }

    console.log(chalk.bold.cyan('\n  === Summary ===\n'));

    const table = new Table({
      head: [
        chalk.white('Target'),
        chalk.white('Pings'),
        chalk.white('OK'),
        chalk.white('Fail'),
        chalk.white('Uptime'),
        chalk.white('Min'),
        chalk.white('Avg'),
        chalk.white('Max'),
        chalk.white('P95'),
        chalk.white('P99'),
        chalk.white('StdDev'),
      ],
      style: { head: [], border: ['gray'] },
      colWidths: [25, 8, 8, 8, 10, 10, 10, 10, 10, 10, 10],
    });

    for (const data of monitorData) {
      const s = data.stats;
      const uptimeColor = s.uptimePercent >= 99 ? chalk.green
        : s.uptimePercent >= 95 ? chalk.yellow
        : chalk.red;

      table.push([
        chalk.bold(data.name),
        String(s.totalPings),
        chalk.green(String(s.successful)),
        s.failed > 0 ? chalk.red(String(s.failed)) : chalk.gray('0'),
        uptimeColor(s.uptimePercent + '%'),
        this.formatMs(s.min),
        this.formatMs(s.avg),
        this.formatMs(s.max),
        this.formatMs(s.p95),
        this.formatMs(s.p99),
        this.formatMs(s.stdDev),
      ]);
    }

    console.log(table.toString());

    // Print status change history
    for (const data of monitorData) {
      if (data.stats.statusChanges && data.stats.statusChanges.length > 0) {
        console.log(chalk.bold('\n  Status changes for ') + chalk.cyan(data.name) + ':');
        for (const change of data.stats.statusChanges) {
          const icon = change.to === 'down' ? chalk.red('\u2717') : chalk.green('\u2713');
          const ts = new Date(change.timestamp).toLocaleTimeString('en-GB', { hour12: false });
          console.log('    ' + icon + ' ' + change.from.toUpperCase() + ' -> ' +
            change.to.toUpperCase() + ' at ' + ts + ' (ping #' + change.pingNumber + ')');
        }
      }
    }

    console.log('');
  }
}

module.exports = { Reporter };
