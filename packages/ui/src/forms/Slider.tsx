import type { InputHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Slider — el `.vtool-slider` del toolkit (`<input type="range">` con el
 * thumb tintado por `--vault-tint`). El `type` queda fijo en `"range"`.
 * Presentacional puro (server component): reenvía `...rest` y `className`.
 *
 * @example
 *   <Slider min={20} max={200} step={1} value={a}
 *     onChange={(e) => setA(Number(e.target.value))} />
 */
export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
}

export function Slider({ className, ...rest }: SliderProps) {
  return (
    <input type="range" className={cn("vtool-slider", className)} {...rest} />
  );
}

export default Slider;
