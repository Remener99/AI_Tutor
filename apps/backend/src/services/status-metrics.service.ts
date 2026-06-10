type StatusBucket = "2xx" | "3xx" | "4xx" | "5xx"

type RouteMetric = {
  count: number
  errors401: number
  errors429: number
  errors5xx: number
  totalLatencyMs: number
  maxLatencyMs: number
  lastStatusCode?: number
  lastSeenAt?: string
}

const startedAt = new Date()
const statusBuckets: Record<StatusBucket, number> = {
  "2xx": 0,
  "3xx": 0,
  "4xx": 0,
  "5xx": 0
}
const routes = new Map<string, RouteMetric>()

const statusBucket = (statusCode: number): StatusBucket => {
  if (statusCode >= 500) return "5xx"
  if (statusCode >= 400) return "4xx"
  if (statusCode >= 300) return "3xx"
  return "2xx"
}

const routeKey = (method: string, url: string) => `${method.toUpperCase()} ${url.split("?")[0]}`

export const recordHttpMetric = ({
  method,
  url,
  statusCode,
  durationMs
}: {
  method: string
  url: string
  statusCode: number
  durationMs: number
}) => {
  statusBuckets[statusBucket(statusCode)] += 1
  const key = routeKey(method, url)
  const metric = routes.get(key) ?? {
    count: 0,
    errors401: 0,
    errors429: 0,
    errors5xx: 0,
    totalLatencyMs: 0,
    maxLatencyMs: 0
  }

  metric.count += 1
  metric.totalLatencyMs += durationMs
  metric.maxLatencyMs = Math.max(metric.maxLatencyMs, durationMs)
  metric.lastStatusCode = statusCode
  metric.lastSeenAt = new Date().toISOString()
  if (statusCode === 401) metric.errors401 += 1
  if (statusCode === 429) metric.errors429 += 1
  if (statusCode >= 500) metric.errors5xx += 1
  routes.set(key, metric)
}

export const getHttpMetricsSnapshot = () => ({
  startedAt: startedAt.toISOString(),
  uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
  statusBuckets,
  routes: [...routes.entries()].map(([route, metric]) => ({
    route,
    count: metric.count,
    errors401: metric.errors401,
    errors429: metric.errors429,
    errors5xx: metric.errors5xx,
    averageLatencyMs: metric.count ? Math.round(metric.totalLatencyMs / metric.count) : 0,
    maxLatencyMs: Math.round(metric.maxLatencyMs),
    lastStatusCode: metric.lastStatusCode,
    lastSeenAt: metric.lastSeenAt
  }))
})
