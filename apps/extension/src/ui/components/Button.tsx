import type { ButtonHTMLAttributes, PropsWithChildren } from "react"
import clsx from "clsx"

type Props = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }>

export const Button = ({ children, className, variant = "primary", ...props }: Props) => (
  <button className={clsx("ai-button", variant !== "primary" && variant, className)} {...props}>
    {children}
  </button>
)
