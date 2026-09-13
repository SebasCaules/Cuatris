import type { TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * TextArea — el `.vtool-textarea` del toolkit (área mono redimensionable
 * en vertical, `min-height` 96px). Presentacional puro (server
 * component): reenvía `...rest` y `className`.
 *
 * @example
 *   <TextArea value={src} onChange={(e) => setSrc(e.target.value)} rows={6} />
 */
export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

export function TextArea({ className, ...rest }: TextAreaProps) {
  return <textarea className={cn("vtool-textarea", className)} {...rest} />;
}

export default TextArea;
