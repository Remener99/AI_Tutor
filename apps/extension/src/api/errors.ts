export class ClientApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

export const mapNetworkError = () => new ClientApiError("NETWORK_ERROR", "Сервис AI-тьютора временно недоступен. Проверьте подключение или попробуйте позже.")
