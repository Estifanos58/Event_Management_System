import { UsersTable, type AdminUserTableRow } from "@/components/admin/tables/users-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/core/db/prisma";

type AdminUsersPageProps = {
  searchParams: Promise<{
    q?: string;
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

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const users = (await prisma.user.findMany({
    where:
      q.length > 0
        ? {
            OR: [
              {
                name: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          }
        : undefined,
    orderBy: {
      createdAt: "desc",
    },
    take: 150,
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
          <CardTitle>Results ({rows.length})</CardTitle>
          <CardDescription>
            Showing up to 150 users for the current filter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
