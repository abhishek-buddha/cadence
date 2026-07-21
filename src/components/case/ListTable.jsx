export default function ListTable({ columns, rows, getRowKey, onRowClick, emptyState }) {
  return (
    <div className="bg-white border border-border rounded-xl overflow-auto max-h-[70vh] shadow-sm">
      <table className="w-full text-sm" style={{ tableLayout: 'auto' }}>
        <thead>
          <tr className="sticky top-0 z-10 bg-table-header">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3.5 text-xs uppercase tracking-wider text-table-header-text font-semibold whitespace-nowrap ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{emptyState}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getRowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'table-row-hover cursor-pointer' : ''}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3.5 whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                    }`}
                  >
                    {col.render ? col.render(row) : (row[col.key] ?? <span className="text-muted/50">--</span>)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
