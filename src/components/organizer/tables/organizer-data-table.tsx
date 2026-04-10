"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type OrganizerDataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  emptyMessage: string;
  searchColumnId?: string;
  searchPlaceholder?: string;
  pageSize?: number;
};

export function OrganizerDataTable<TData>({
  columns,
  data,
  emptyMessage,
  searchColumnId,
  searchPlaceholder,
  pageSize = 10,
}: OrganizerDataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  // TanStack Table relies on dynamic function references by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const searchColumn = searchColumnId ? table.getColumn(searchColumnId) : undefined;
  const searchValue = (searchColumn?.getFilterValue() as string | undefined) ?? "";

  const filteredCount = table.getFilteredRowModel().rows.length;
  const currentPage = table.getState().pagination.pageIndex + 1;
  const totalPages = table.getPageCount();

  const range = useMemo(() => {
    const { pageIndex, pageSize: resolvedPageSize } = table.getState().pagination;

    if (filteredCount === 0) {
      return "0-0";
    }

    const start = pageIndex * resolvedPageSize + 1;
    const end = Math.min(start + resolvedPageSize - 1, filteredCount);
    return `${start}-${end}`;
  }, [filteredCount, table]);

  return (
    <div className="space-y-3">
      {searchColumn ? (
        <Input
          value={searchValue}
          onChange={(event) => searchColumn.setFilterValue(event.target.value)}
          placeholder={searchPlaceholder ?? "Search table"}
          className="max-w-sm"
        />
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500"
              >
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const sortLabel =
                    sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : "";

                  return (
                    <th key={header.id} className="px-6 py-4 font-semibold uppercase tracking-wider">
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold hover:text-gray-900 transition-colors"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <span className="text-[10px] text-gray-400">{sortLabel.trim()}</span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-gray-100">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  className="px-6 py-12 text-center text-sm text-gray-500"
                  colSpan={columns.length}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-gray-50/50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 pt-2">
        <p className="font-medium">
          Showing {range} of {filteredCount}
        </p>

        <div className="flex items-center gap-2">
          <span>
            Page {Math.min(currentPage, Math.max(totalPages, 1))} of {Math.max(totalPages, 1)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
