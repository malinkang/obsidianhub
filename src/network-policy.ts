export const MAX_CACHED_IMAGE_BYTES = 15 * 1024 * 1024

export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || !isPublicHostname(url.hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}

function isPublicHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
  if (!hostname || !hostname.includes(".") || hostname === "localhost") return false
  if ([".localhost", ".local", ".internal", ".home", ".lan"].some((suffix) => hostname.endsWith(suffix))) return false
  if (hostname.includes(":")) return isPublicIpv6(hostname)
  if (/^\d+(?:\.\d+){3}$/.test(hostname)) return isPublicIpv4(hostname)
  return true
}

function isPublicIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number)
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false
  const [a, b] = octets as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 || b === 168)) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  return true
}

function isPublicIpv6(hostname: string): boolean {
  if (hostname === "::" || hostname === "::1" || hostname.startsWith("::ffff:")) return false
  const first = Number.parseInt(hostname.split(":", 1)[0] || "0", 16)
  if (!Number.isFinite(first)) return false
  if ((first & 0xfe00) === 0xfc00) return false
  if ((first & 0xffc0) === 0xfe80) return false
  if ((first & 0xff00) === 0xff00) return false
  return true
}
