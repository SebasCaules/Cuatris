import type { ReactNode, TableHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * DataTable — tabla compacta `.vtool-table` genérica, dirigida por datos.
 * Cada columna declara su `key` (usada para indexar cada fila), su
 * `header` y opcionalmente la alineación de texto. Las filas son
 * registros indexados por esas keys.
 *
 * @example
 *   <DataTable
 *     columns={[
 *       { key: "campo", header: "Campo" },
 *       { key: "tipo", header: "Tipo" },
 *       { key: "n", header: "Bytes", align: "right" },
 *     ]}
 *     rows={[
 *       { campo: "id", tipo: <code>uuid</code>, n: 16 },
 *       { campo: "nombre", tipo: <code>text</code>, n: "—" },
 *     ]}
 *   />
 */
interface Column {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
}

interface CommonProps {
  columns: Column[];
  /** Filas indexadas por las keys de las columnas. Un `id` opcional da una
   *  key estable a React (si se omite, se usa el índice). */
  rows: Array<Record<string, ReactNode> & { id?: string | number }>;
  className?: string;
}

export type DataTableProps = CommonProps &
  Omit<TableHTMLAttributes<HTMLTableElement>, keyof CommonProps>;

export function DataTable({ columns, rows, className, ...rest }: DataTableProps) {
  return (
    <table className={cn("vtool-table", className)} {...rest}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} style={col.align ? { textAlign: col.align } : undefined}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id ?? i}>
            {columns.map((col) => (
              <td key={col.key} style={col.align ? { textAlign: col.align } : undefined}>
                {row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default DataTable;
