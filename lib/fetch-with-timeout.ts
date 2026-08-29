/**
 * Fetch Wrapper with Timeout and Retry Logic
 * Provides consistent timeout handling for all external HTTP calls.
 */

export interface FetchOptions extends RequestInit {
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number
  /** Maximum number of retries (default: 2) */
  maxRetries?: number
  /** Base delay between retries in ms (default: 1000) */
  retryDelay?: number
  /** Callback for retry attempts */
  onRetry?: (attempt: number, error: Error) => void
}

/**
 * Default fetch options
 */
const DEFAULT_TIMEOUT = 10000
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_RETRY_DELAY = 1000

/**
 * Checks if an error is retryable (network errors, timeouts, 5xx)
 */
function isRetryableError(error: Error): boolean {
  if (error.name === "AbortError" || error.name === "TimeoutError") return true
  // Network errors (fetch throws TypeError for network failures)
  if (error instanceof TypeError && error.message.includes("fetch")) return true
  // Check for 5xx status codes in error message
  if (error.message.includes("500") || error.message.includes("502") || 
      error.message.includes("503") || error.message.includes("504")) return true
  return false
}

/**
 * Creates an AbortController with timeout
 */
function createTimeoutController(timeoutMs: number): { controller: AbortController; timeoutId: NodeJS.Timeout } {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  return { controller, timeoutId }
}

/**
 * Fetch with automatic timeout and retry logic
 * 
 * @param url - URL to fetch
 * @param options - Fetch options including timeout, retries
 * @returns Response object
 * 
 * @example
 * ```ts
 * const response = await fetchWithTimeout("https://api.example.com/data", {
 *   timeout: 8000,
 *   maxRetries: 3,
 *   onRetry: (attempt, err) => console.log(`Retry ${attempt}: ${err.message}`)
 * })
 * const data = await response.json()
 * ```
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY
  const onRetry = options.onRetry

  // Extract timeout from options to avoid passing to fetch
  const { timeout: _, maxRetries: __, retryDelay: ___, onRetry: ____, ...fetchOptions } = options

  let lastError: Error

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { controller, timeoutId } = createTimeoutController(timeout)

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      // Check for HTTP errors that should trigger retry
      if (!response.ok && response.status >= 500 && response.status < 600) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return response

    } catch (error) {
      clearTimeout(timeoutId)
      lastError = error as Error

      // Don't retry on abort (intentional cancellation)
      if (error instanceof Error && (error.name === "AbortError" || error.name === "CancellationError")) {
        throw new Error(`Request aborted: ${error.message}`)
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw lastError
      }

      // Check if error is retryable
      if (!isRetryableError(lastError)) {
        throw lastError
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, lastError)
      }

      // Wait before retry with exponential backoff
      const delay = retryDelay * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError!
}

/**
 * Fetch JSON with timeout and automatic parsing
 */
export async function fetchJson<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const response = await fetchWithTimeout(url, options)
  
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`HTTP ${response.status}: ${response.statusText} - ${text}`)
  }

  return response.json()
}

/**
 * Fetch text with timeout
 */
export async function fetchText(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const response = await fetchWithTimeout(url, options)
  
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`HTTP ${response.status}: ${response.statusText} - ${text}`)
  }

  return response.text()
}

/**
 * Creates a fetch function with preset options (useful for API clients)
 */
export function createFetcher(defaultOptions: FetchOptions = {}) {
  return {
    fetch: (url: string, options?: FetchOptions) => fetchWithTimeout(url, { ...defaultOptions, ...options }),
    json: <T>(url: string, options?: FetchOptions) => fetchJson<T>(url, { ...defaultOptions, ...options }),
    text: (url: string, options?: FetchOptions) => fetchText(url, { ...defaultOptions, ...options }),
  }
}

/**
 * Pre-configured fetchers for common use cases
 */
export const apiFetcher = createFetcher({
  timeout: 8000,
  maxRetries: 2,
  headers: {
    "Accept": "application/json",
    "User-Agent": "QuinielaIA/1.0"
  }
})

export const htmlFetcher = createFetcher({
  timeout: 10000,
  maxRetries: 2,
  headers: {
    "Accept": "text/html",
    "User-Agent": "Mozilla/5.0 (compatible; QuinielaIA/1.0)"
  }
})

export const fastFetcher = createFetcher({
  timeout: 5000,
  maxRetries: 1,
  headers: {
    "User-Agent": "QuinielaIA/1.0"
  }
})