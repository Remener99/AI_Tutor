const API_BASE = "https://bba9tns6u21vsn66e7fq.containers.yandexcloud.net"
const API_TOKEN = "si-EQp-H0Ug2TI3RlTyD8zun4hYuZJSKZ22Z7We54f8"

type ApiProxyMessage = {
  type: "AI_TUTOR_API"
  path: string
  payload?: unknown
  timeoutMs?: number
}

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = 60_000) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

chrome.runtime.onMessage.addListener((message: ApiProxyMessage, _sender, sendResponse) => {
  if (message?.type !== "AI_TUTOR_API") return false

  void (async () => {
    try {
      const response = await fetchWithTimeout(`${API_BASE}${message.path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ai-tutor-api-token": API_TOKEN
        },
        body: JSON.stringify(message.payload)
      }, message.timeoutMs)
      const contentType = response.headers.get("content-type") ?? ""
      const data = contentType.includes("application/json")
        ? await response.json().catch(() => ({
            ok: false,
            error: {
              code: "API_ERROR",
              message: `Сервис AI-тьютора вернул ошибку ${response.status}.`
            }
          }))
        : {
            ok: false,
            error: {
              code: "API_ERROR",
              message: `Сервис AI-тьютора вернул некорректный ответ ${response.status}.`
            }
          }
      sendResponse({ ok: response.ok && contentType.includes("application/json"), data })
    } catch (error) {
      sendResponse({
        ok: false,
        data: {
          ok: false,
          error: {
            code: "NETWORK_ERROR",
            message: error instanceof Error ? error.message : "Сервис AI-тьютора временно недоступен."
          }
        }
      })
    }
  })()

  return true
})
