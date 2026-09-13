import type { InputHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * TextInput — el `.vtool-input` del toolkit (input mono, superficie
 * `surface-3` con ring al focus). `type` por defecto `"text"`.
 * Presentacional puro (server component): reenvía `...rest` y `className`.
 *
 * @example
 *   <TextInput value={mu} onChange={(e) => setMu(e.target.value)} />
 *   <TextInput type="number" min={0} placeholder="n" />
 */
export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function TextInput({
  type = "text",
  className,
  ...rest
}: TextInputProps) {
  return (
    <input type={type} className={cn("vtool-input", className)} {...rest} />
  );
}

export default TextInput;
