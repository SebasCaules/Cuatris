import Link from "next/link";
import type { ReactNode, AnchorHTMLAttributes } from "react";
import { cn } from "../cn";
import BrandMark from "./BrandMark";

/**
 * Brand — el lockup de marca: `.brand` con `<BrandMark/>` + el nombre
 * `.brand__name`. Enlaza con next/link (por defecto a la home).
 * Presentacional puro.
 *
 * @example
 *   <Brand />
 *   <Brand href="/" label={<>My<b>App</b></>} />
 */
export interface BrandProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  /** Destino del lockup. Por defecto `"/"`. */
  href?: string;
  /** Contenido del nombre. Por defecto `Study<b>Vaults</b>`. */
  label?: ReactNode;
  className?: string;
}

export function Brand({
  href = "/",
  label = (
    <>
      Study<b>Vaults</b>
    </>
  ),
  className,
  ...rest
}: BrandProps) {
  return (
    <Link className={cn("brand", className)} href={href} {...rest}>
      <BrandMark />
      <span className="brand__name">{label}</span>
    </Link>
  );
}

export default Brand;
