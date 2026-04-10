"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { OrganizerDataTable } from "@/components/organizer/tables/organizer-data-table";

export type AttendeeTableRow = {
  ticketId: string;
  attendeeName: string;
  attendeeEmail: string;
  ticketClass: string;
  ticketStatus: string;
  checkedIn: boolean;
  issuedAt: string;
  orderId: string;
};

type AttendeesTableProps = {
  rows: AttendeeTableRow[];
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function AttendeesTable({ rows }: AttendeesTableProps) {
  const columns = useMemo<ColumnDef<AttendeeTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "attendeeName",
        header: "Attendee",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-gray-900">{row.original.attendeeName}</p>
            <p className="text-xs text-gray-500">{row.original.attendeeEmail}</p>
          </div>
        ),
      },
      {
        accessorKey: "ticketClass",
        header: "Ticket class",
      },
      {
        accessorKey: "ticketStatus",
        header: "Ticket status",
      },
      {
        accessorKey: "checkedIn",
        header: "Check-in",
        cell: ({ row }) => (row.original.checkedIn ? "Checked in" : "Not checked in"),
      },
      {
        accessorKey: "issuedAt",
        header: "Issued",
        cell: ({ row }) => formatDateTime(row.original.issuedAt),
      },
      {
        accessorKey: "orderId",
        header: "Order",
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
      emptyMessage="No attendee tickets were found for this event."
      searchColumnId="attendeeName"
      searchPlaceholder="Search attendee name"
      pageSize={8}
    />
  );
}
