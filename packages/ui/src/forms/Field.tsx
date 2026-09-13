"use client";

import { Children, cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Field — el `.vtool-field` del toolkit: agrupa un `<label>` mono en
 * mayúsculas con el control. Si pasás `hint`, se renderiza como `<b>` a
 * la derecha (el CSS de `.vtool-label` ya reparte con `space-between`).
 *
 * Asocia automáticamente la etiqueta con el control: si no pasás `htmlFor`
 * y el único hijo es un elemento sin `id`, le inyecta un `id` generado y lo
 * usa en el `for` del label (clic en la etiqueta enfoca el control).
 *
 * @example
 *   <Field label="Distribución">
 *     <Select options={dists} />
 *   </Field>
 *   <Field label="σ" hint="> 0">
 *     <TextInput value={sigma} onChange={onSigma} />
 *   </Field>
 */
export interface FieldProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Texto/contenido de la etiqueta (lado izquierdo). */
  label: ReactNode;
  /** Pista opcional alineada a la derecha (se envuelve en `<b>`). */
  hint?: ReactNode;
  /** `id` del control que la etiqueta describe; si se omite, se autogenera. */
  htmlFor?: string;
  /** El control del formulario (input/select/textarea/…). */
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
  ...rest
}: FieldProps) {
  const autoId = useId();
  let forId = htmlFor;
  let control = children;

  // Si no se pasó htmlFor y hay un único hijo elemento sin id, los asociamos.
  if (!forId && Children.count(children) === 1 && isValidElement(children)) {
    const child = children as ReactElement<{ id?: string }>;
    const childId = child.props.id;
    forId = childId ?? autoId;
    if (!childId) control = cloneElement(child, { id: forId });
  }

  return (
    <div className={cn("vtool-field", className)} {...rest}>
      <label className="vtool-label" htmlFor={forId}>
        <span>{label}</span>
        {hint != null && <b>{hint}</b>}
      </label>
      {control}
    </div>
  );
}

export default Field;
