/**
 * Sliding Window In-Memory Rate Limiter
 * Limits requests per client session or IP address over a sliding time window.
 */

interface RateLimitResult {
  limited: boolean;
  retryAfterMs: number;
  remaining: number;
}

const windowMs = 60 * 1000; // 60 seconds
const maxLimit = 15; // 15 requests per window

const requestLogs = new Map<string, number[]>();
let lastCleanup = Date.now();

/**
 * Periodically cleans up fully expired keys to avoid memory leaks.
 */
function runPeriodicCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return; // Clean up every 5 minutes
  
  for (const [key, timestamps] of requestLogs.entries()) {
    const active = timestamps.filter(t => now - t < windowMs);
    if (active.length === 0) {
      requestLogs.delete(key);
    } else {
      requestLogs.set(key, active);
    }
  }
  lastCleanup = now;
}

/**
 * Checks if a key has exceeded the rate limit.
 * @param key Unique key representing the client (e.g. Session ID or IP)
 * @param limit Maximum requests allowed in the window (default: 15)
 * @param window Time window in milliseconds (default: 60s)
 */
export async function isRateLimited(
  key: string,
  limit: number = maxLimit,
  window: number = windowMs
): Promise<RateLimitResult> {
  runPeriodicCleanup();

  const now = Date.now();
  const timestamps = requestLogs.get(key) || [];
  
  // Filter out timestamps that fall outside the sliding window
  const activeWindow = timestamps.filter(t => now - t < window);
  
  if (activeWindow.length >= limit) {
    const oldestTimestamp = activeWindow[0];
    const retryAfterMs = Math.max(0, window - (now - oldestTimestamp));
    
    // Save filtered timestamps back
    requestLogs.set(key, activeWindow);
    
    return {
      limited: true,
      retryAfterMs,
      remaining: 0
    };
  }
  
  // Accept request, append current time
  activeWindow.push(now);
  requestLogs.set(key, activeWindow);
  
  return {
    limited: false,
    retryAfterMs: 0,
    remaining: Math.max(0, limit - activeWindow.length)
  };
}
