import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";

type OrganizationRow = {
  id: string;
  legalName: string;
  displayName: string;
  kycStatus: string;
  defaultCurrency: string;
  region: string;
  createdAt: Date;
  _count: {
    events: number;
    roleBindings: number;
    orders: number;
    riskCases: number;
  };
};

export default async function AdminOrganizationsPage() {
  const organizations = (await prisma.organization.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
    select: {
      id: true,
      legalName: true,
      displayName: true,
      kycStatus: true,
      defaultCurrency: true,
      region: true,
      createdAt: true,
      _count: {
        select: {
          events: true,
          roleBindings: true,
          orders: true,
          riskCases: true,
        },
      },
    },
  })) as OrganizationRow[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Oversight</CardTitle>
        <CardDescription>
          Verification state, regional footprint, and operational activity by organization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {organizations.length === 0 ? (
          <p className="text-sm text-gray-500">No organizations found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                  <th className="py-2 pr-4">Organization</th>
                  <th className="py-2 pr-4">KYC</th>
                  <th className="py-2 pr-4">Region</th>
                  <th className="py-2 pr-4">Events</th>
                  <th className="py-2 pr-4">Risk cases</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((organization) => (
                  <tr key={organization.id} className="border-b border-gray-200/60 align-top">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-900">{organization.displayName}</p>
                      <p className="mt-1 text-xs text-gray-500">{organization.legalName}</p>
                      <p className="mt-1 text-xs text-gray-500">{organization.id}</p>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{organization.kycStatus}</td>
                    <td className="py-3 pr-4 text-gray-500">
                      <p>{organization.region}</p>
                      <p className="mt-1 text-xs">Currency: {organization.defaultCurrency}</p>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">
                      <p>{organization._count.events}</p>
                      <p className="mt-1 text-xs">Role bindings: {organization._count.roleBindings}</p>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{organization._count.riskCases}</td>
                    <td className="py-3 text-gray-500">{organization.createdAt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
