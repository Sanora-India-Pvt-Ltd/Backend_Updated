/**
 * In-memory metrics counter module.
 * Tracks requests_total, errors_total, and route_latency_ms for GET /metrics.
 */

const MAX_ROUTES = 1000;
const routeLatency = new Map(); // route -> { count, sum }

let requestsTotal = 0;
let errorsTotal = 0;

function incrementRequests() {
    requestsTotal += 1;
}

function incrementErrors() {
    errorsTotal += 1;
}

/**
 * Record latency for a route (e.g. "GET /api/auth/login").
 * Caps total routes stored to avoid unbounded memory growth.
 * @param {string} route - Route identifier
 * @param {number} ms - Duration in milliseconds
 */
function recordLatency(route, ms) {
    const key = route || 'unknown';
    const existing = routeLatency.get(key) || { count: 0, sum: 0 };
    existing.count += 1;
    existing.sum += ms;
    routeLatency.set(key, existing);

    if (routeLatency.size > MAX_ROUTES) {
        const firstKey = routeLatency.keys().next().value;
        routeLatency.delete(firstKey);
    }
}

/**
 * Record one request: increments total, optionally errors, and latency.
 * @param {string} route - Route identifier
 * @param {number} statusCode - HTTP status code
 * @param {number} durationMs - Request duration in ms
 */
function recordRequest(route, statusCode, durationMs) {
    incrementRequests();
    if (statusCode >= 500) {
        incrementErrors();
    }
    recordLatency(route, durationMs);
}

/**
 * Snapshot for GET /metrics (JSON).
 * @returns {{ requests_total: number, errors_total: number, route_latency_ms: Object }}
 */
function getSnapshot() {
    const routeLatencyMs = {};
    for (const [route, { count, sum }] of routeLatency) {
        routeLatencyMs[route] = { count, sum, avg_ms: count ? Math.round(sum / count) : 0 };
    }
    return {
        requests_total: requestsTotal,
        errors_total: errorsTotal,
        route_latency_ms: routeLatencyMs
    };
}

/**
 * Top 10 routes by average latency (slowest first).
 * @returns {{ top_slow_routes: Array<{ route: string, count: number, sum: number, avg_ms: number }> }}
 */
function getTopSlowRoutes() {
    const entries = [];
    for (const [route, { count, sum }] of routeLatency) {
        const avgMs = count ? Math.round(sum / count) : 0;
        entries.push({ route, count, sum, avg_ms: avgMs });
    }
    entries.sort((a, b) => b.avg_ms - a.avg_ms);
    const top10 = entries.slice(0, 10);
    return { top_slow_routes: top10 };
}

function reset() {
    requestsTotal = 0;
    errorsTotal = 0;
    routeLatency.clear();
}

module.exports = {
    incrementRequests,
    incrementErrors,
    recordLatency,
    recordRequest,
    getSnapshot,
    getTopSlowRoutes,
    reset
};
