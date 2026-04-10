"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { OrganizerDataTable } from "@/components/organizer/tables/organizer-data-table";

export type OrderTableRow = {
  orderId: string;
  buyerName: string;
  buyerEmail: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  currency: string;
  completedAt?: string;
  createdAt: string;
};

type OrdersTableProps = {
  rows: OrderTableRow[];
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function OrdersTable({ rows }: OrdersTableProps) {
  const columns = useMemo<ColumnDef<OrderTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "buyerName",
        header: "Buyer",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-gray-900">{row.original.buyerName}</p>
            <p className="text-xs text-gray-500">{row.original.buyerEmail}</p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Order status",
      },
      {
        accessorKey: "paymentStatus",
        header: "Payment",
      },
      {
        accessorKey: "totalAmount",
        header: "Total",
        cell: ({ row }) => formatMoney(row.original.totalAmount, row.original.currency),
      },
      {
        accessorKey: "completedAt",
        header: "Completed",
        cell: ({ row }) =>
          row.original.completedAt ? formatDateTime(row.original.completedAt) : "Pending",
      },
      {
        accessorKey: "orderId",
        header: "Order ID",
        cell: ({ row }) => (
          <code className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-700">
            {row.original.orderId}
          </code>
        ),
      },
    ],
    [],
  );

  return (
    <OrganizerDataTable
      columns={columns}
      data={rows}
      emptyMessage="No orders were found for this event."
      searchColumnId="buyerName"
      searchPlaceholder="Search buyer name"
      pageSize={8}
    />
  );
}
