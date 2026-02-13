'use strict';

const logger = require('../logger');

const INTERVAL_MS = 30 * 1000;
const LAG_CHECK_MS = 100;

/**
 * Measure approximate event loop lag: schedule a 100ms setTimeout and compare actual delay.
 * @returns {Promise<number>} Lag in milliseconds (actual delay minus expected 100ms).
 */
function measureEventLoopLag() {
  return new Promise((resolve) => {
    const start = Date.now();
    setTimeout(() => {
      const actual = Date.now() - start;
      resolve(Math.max(0, actual - LAG_CHECK_MS));
    }, LAG_CHECK_MS);
  });
}

/**
 * Log one runtime stats snapshot. Non-throwing.
 */
function logStats() {
  try {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
    const heapTotalMB = Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100;
    const rssMB = Math.round((mem.rss / 1024 / 1024) * 100) / 100;
    const uptimeSeconds = Math.round(process.uptime() * 100) / 100;

    measureEventLoopLag()
      .then((lagMs) => {
        try {
          logger.info('Runtime stats', {
            heapUsedMB,
            heapTotalMB,
            rssMB,
            uptimeSeconds,
            eventLoopLagMs: Math.round(lagMs * 100) / 100
          });
        } catch (e) {
          // no-op
        }
      })
      .catch(() => {});
  } catch (_) {
    // no-op: do not crash
  }
}

/**
 * Start the production runtime monitor. Only runs when NODE_ENV === 'production'.
 * Logs heap, rss, uptime and event loop lag every 30 seconds. Non-blocking; never throws.
 */
function startRuntimeMonitor() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  try {
    setInterval(logStats, INTERVAL_MS);
  } catch (_) {
    // no-op
  }
}

module.exports = { startRuntimeMonitor };
