"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { ReportTargetButton } from "@/components/moderation/report-target-button";
import { BanUserButton } from "@/components/organizer/ban-user-button";
import { OrganizerDataTable } from "@/components/organizer/tables/organizer-data-table";

export type AttendeeTableRow = {
  ticketId: string;
  attendeeUserId: string;
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
  organizationId: string;
  eventId: string;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function AttendeesTable({ rows, organizationId, eventId }: AttendeesTableProps) {
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
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <BanUserButton
              userId={row.original.attendeeUserId}
              organizationId={organizationId}
              userLabel={row.original.attendeeName}
            />
            <ReportTargetButton
              eventId={eventId}
              targetType="USER"
              targetId={row.original.attendeeUserId}
              targetLabel={row.original.attendeeName}
              triggerLabel="Report"
              triggerClassName="h-8 border border-gray-200 bg-white px-2 text-gray-700 hover:bg-gray-50"
            />
          </div>
        ),
      },
    ],
    [eventId, organizationId],
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
