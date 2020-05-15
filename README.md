# uptimeping

> **[EN]** Continuous uptime monitor for URLs and TCP hosts — ping on a schedule, collect statistics, watch multiple targets from a config file and get a live table summary.
> **[FR]** Moniteur de disponibilité continu pour les URLs et les hôtes TCP — ping selon un calendrier, collecte de statistiques, surveillance de plusieurs cibles depuis un fichier de configuration et résumé en tableau en direct.

---

## Features / Fonctionnalités

**[EN]**
- HTTP, HTTPS and raw TCP ping modes
- Continuous monitoring with configurable interval (`--interval`) and per-request timeout (`--timeout`)
- Count-limited runs (`--count N`) or infinite until Ctrl+C
- Multi-target monitoring from a JSON/YAML config file (`multi` command)
- One-shot check (`check` command) for use in health scripts and CI
- Live table, minimal or JSON output formats
- Summary report on exit: total pings, uptime %, avg/min/max response time
- Configurable expected HTTP status code (`--expect`)
- Custom HTTP method for endpoints that reject GET (`--method HEAD`)

**[FR]**
- Modes de ping HTTP, HTTPS et TCP brut
- Surveillance continue avec intervalle configurable (`--interval`) et timeout par requête (`--timeout`)
- Exécutions limitées en nombre (`--count N`) ou infinies jusqu'à Ctrl+C
- Surveillance multi-cibles depuis un fichier de configuration JSON/YAML (commande `multi`)
- Vérification unique (commande `check`) pour utilisation dans des scripts de santé et le CI
- Formats de sortie tableau en direct, minimal ou JSON
- Rapport récapitulatif à la sortie : total des pings, % de disponibilité, temps de réponse moyen/min/max
- Code de statut HTTP attendu configurable (`--expect`)
- Méthode HTTP personnalisée pour les endpoints qui rejettent GET (`--method HEAD`)

---

## Installation

```bash
npm install -g @idirdev/uptimeping
```

---

## CLI Usage / Utilisation CLI

```bash
# Continuous ping / Ping continu
uptimeping ping https://api.example.com/health

# Ping every 10 seconds / Ping toutes les 10 secondes
uptimeping ping https://api.example.com/health --interval 10000

# Limit to 20 pings / Limiter à 20 pings
uptimeping ping https://api.example.com/health --count 20

# TCP mode on port 5432 / Mode TCP sur le port 5432
uptimeping ping db.example.com --mode tcp --port 5432

# Single check (exit 0 = up, exit 1 = down) / Vérification unique
uptimeping check https://api.example.com/health
uptimeping check https://api.example.com/health --mode https --expect 200

# Expect a specific status code / Attendre un code de statut spécifique
uptimeping ping https://api.example.com/redirect --expect 301

# Use HEAD method / Utiliser la méthode HEAD
uptimeping ping https://cdn.example.com/asset.js --method HEAD

# Monitor multiple targets from config / Surveiller plusieurs cibles depuis la config
uptimeping multi targets.json

# JSON output / Sortie JSON
uptimeping ping https://api.example.com/health --output json
```

### targets.json example / Exemple targets.json

```json
{
  "targets": [
    { "name": "API",     "url": "https://api.example.com/health", "interval": 5000 },
    { "name": "Website", "url": "https://example.com",            "interval": 30000 },
    { "name": "DB Port", "url": "db.example.com", "mode": "tcp",  "port": 5432, "interval": 10000 }
  ]
}
```

### Example Output / Exemple de sortie

```
  uptimeping v1.2.0
  Press Ctrl+C to stop and see summary

  TARGET                  STATUS   CODE   TIME    TIMESTAMP
  https://api.example.com   UP     200    43ms    2026-03-16 08:42:11
  https://api.example.com   UP     200    38ms    2026-03-16 08:42:16
  https://api.example.com   DOWN   timeout  -     2026-03-16 08:42:21
  https://api.example.com   UP     200    51ms    2026-03-16 08:42:26

Shutting down...

  SUMMARY: https://api.example.com
  Total pings: 4  |  Up: 3  |  Down: 1
  Uptime: 75.00%  |  Avg: 44ms  |  Min: 38ms  |  Max: 51ms
```

---

## API (Programmatic) / API (Programmation)

```js
const { createMonitor, Monitor, Pinger, Stats, formatReport } = require('@idirdev/uptimeping');

// Create and start a monitor / Créer et démarrer un moniteur
const monitor = createMonitor([
  { name: 'API',  url: 'https://api.example.com/health', interval: 5000, timeout: 8000 },
  { name: 'Site', url: 'https://example.com',            interval: 30000 },
], { output: 'minimal' });

// Monitor fires events / Le moniteur émet des événements
monitor.on('ping', (target, result) => {
  // result: { status: 'up'|'down', code, time, timestamp }
  if (result.status === 'down') {
    sendAlert(target.name + ' is DOWN');
  }
});

monitor.start();

// Single-shot ping / Ping unique
const { Pinger } = require('@idirdev/uptimeping');
const pinger = new Pinger({ url: 'https://api.example.com/health', timeout: 5000 });
const result = await pinger.ping();
console.log(result.status, result.time + 'ms');
```

---

## License

MIT — idirdev
