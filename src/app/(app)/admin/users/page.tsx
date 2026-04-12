import { UsersTable, type AdminUserTableRow } from "@/components/admin/tables/users-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { prisma } from "@/core/db/prisma";

const PAGE_SIZE = 12;

type AdminUsersPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  roleBindings: {
    role: string;
    scopeType: string;
  }[];
};

function parsePage(value: string | undefined) {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function createPageHref(page: number, q: string) {
  const qSegment = q.length > 0 ? `&q=${encodeURIComponent(q)}` : "";
  return `/admin/users?page=${page}${qSegment}`;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const requestedPage = parsePage(params.page);

  const whereClause =
    q.length > 0
      ? {
          OR: [
            {
              name: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              email: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : undefined;

  const totalUsers = await prisma.user.count({
    where: whereClause,
  });

  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const users = (await prisma.user.findMany({
    where: whereClause,
    orderBy: {
      createdAt: "desc",
    },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
      roleBindings: {
        select: {
          role: true,
          scopeType: true,
        },
      },
    },
  })) as UserRow[];

  const rows: AdminUserTableRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
    roleBindings: user.roleBindings,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User Directory</CardTitle>
          <CardDescription>
            Platform account inventory with role and scope binding visibility.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <input type="hidden" name="page" value="1" />
            <label className="text-sm font-medium text-gray-900">
              Search users
              <Input className="mt-1" name="q" defaultValue={q} placeholder="Name or email" />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-900 hover:bg-gray-100"
              >
                Apply
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results ({totalUsers})</CardTitle>
          <CardDescription>
            Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable rows={rows} />

          <PaginationControls
            summary={`Showing ${rows.length} users on this page`}
            previousHref={createPageHref(Math.max(1, page - 1), q)}
            nextHref={createPageHref(Math.min(totalPages, page + 1), q)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
