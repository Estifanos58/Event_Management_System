"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { OrganizerDataTable } from "@/components/organizer/tables/organizer-data-table";

export type StaffTableRow = {
  userId: string;
  name: string;
  email: string;
  gateAssignments: string;
  assignmentCount: number;
};

type StaffTableProps = {
  rows: StaffTableRow[];
};

export function StaffTable({ rows }: StaffTableProps) {
  const columns = useMemo<ColumnDef<StaffTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Staff",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-gray-900">{row.original.name}</p>
            <p className="text-xs text-gray-500">{row.original.email}</p>
          </div>
        ),
      },
      {
        accessorKey: "gateAssignments",
        header: "Gate assignments",
      },
      {
        accessorKey: "assignmentCount",
        header: "Assignment count",
      },
      {
        accessorKey: "userId",
        header: "User ID",
        cell: ({ row }) => (
          <code className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-700">
            {row.original.userId}
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
      emptyMessage="No staff members are currently bound to this event."
      searchColumnId="name"
      searchPlaceholder="Search staff name"
      pageSize={8}
    />
  );
}
