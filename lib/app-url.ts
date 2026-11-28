const LOCAL_APP_URL = "http://localhost:3000"

export function getAppBaseUrl(): string {
  const configuredUrl = [
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ].find((value) => value?.trim())
  const platformDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL_URL
  const candidate = configuredUrl?.trim().replace(/"/g, "")
    || (platformDomain ? `https://${platformDomain.trim()}` : "")

  if (!candidate) {
    if (process.env.NODE_ENV !== "production") return LOCAL_APP_URL
    throw new Error("App URL is not configured; set NEXT_PUBLIC_BASE_URL or a public Railway/Vercel domain")
  }

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`)
  } catch {
    throw new Error("App URL must be a valid HTTP(S) URL or public domain")
  }

  if (url.username || url.password || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new Error("App URL must use HTTPS and cannot include credentials")
  }

  return url.origin
}
