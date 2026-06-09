export const getLocal = async <T>(key: string, fallback: T): Promise<T> => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return fallback
  try {
    const result = await chrome.storage.local.get(key)
    return (result[key] ?? fallback) as T
  } catch {
    return fallback
  }
}

export const setLocal = async <T>(key: string, value: T): Promise<void> => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return
  try {
    await chrome.storage.local.set({ [key]: value })
  } catch {
    // The embedded LMS panel can outlive a reloaded extension context.
  }
}
