type ObsidianResponse = {
  arrayBuffer: ArrayBuffer
  status: number
  headers: HeadersInit
}

export function toFetchResponse(method: string | undefined, response: ObsidianResponse): Response {
  const normalizedMethod = (method || "GET").toUpperCase()
  const body = normalizedMethod === "HEAD" || [204, 205, 304].includes(response.status)
    ? null
    : response.arrayBuffer
  return new Response(body, {
    status: response.status,
    headers: response.headers,
  })
}
