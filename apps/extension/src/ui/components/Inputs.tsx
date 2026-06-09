import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"

export const TextInput = (props: InputHTMLAttributes<HTMLInputElement>) => <input className="ai-input" {...props} />
export const NumberInput = (props: InputHTMLAttributes<HTMLInputElement>) => <input className="ai-input" type="number" {...props} />
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select className="ai-select" {...props} />
export const TextArea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className="ai-textarea" {...props} />
