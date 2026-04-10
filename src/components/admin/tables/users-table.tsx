"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { OrganizerDataTable } from "@/components/organizer/tables/organizer-data-table";

export type AdminUserTableRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  roleBindings: {
    role: string;
    scopeType: string;
  }[];
};

type UsersTableProps = {
  rows: AdminUserTableRow[];
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function UsersTable({ rows }: UsersTableProps) {
  const columns = useMemo<ColumnDef<AdminUserTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "User",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <p className="font-semibold text-gray-900">{row.original.name}</p>
            <p className="text-xs font-medium text-gray-500">{row.original.email}</p>
          </div>
        ),
      },
      {
        accessorKey: "emailVerified",
        header: "Verification",
        cell: ({ row }) => row.original.emailVerified ? (
          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">Verified</span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">Unverified</span>
        ),
      },
      {
        accessorKey: "roleBindings",
        header: "Role bindings",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roleBindings.length === 0 ? (
              <span className="text-xs text-gray-500">No role bindings</span>
            ) : row.original.roleBindings.map((binding, i) => (
              <span key={i} className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                {binding.role} <span className="ml-1 opacity-60">({binding.scopeType})</span>
              </span>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => <span className="text-sm font-medium text-gray-600">{formatDateTime(row.original.createdAt)}</span>,
      },
      {
        accessorKey: "id",
        header: "Actions",
        cell: ({ row }) => (
          <Link
            href={`/admin/users/${row.original.id}`}
            className="inline-flex rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-gray-50"
          >
            View detail
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <OrganizerDataTable
      columns={columns}
      data={rows}
      emptyMessage="No users matched the filter."
      searchColumnId="name"
      searchPlaceholder="Search user name"
      pageSize={12}
    />
  );
}