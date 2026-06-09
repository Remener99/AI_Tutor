export const ErrorState = ({ message }: { message?: string }) => message ? <div className="ai-error">{message}</div> : null
