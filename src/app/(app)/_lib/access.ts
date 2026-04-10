import { Role, ScopeType } from "@prisma/client";
import { redirect } from "next/navigation";
import { getDashboardSnapshot } from "@/domains/identity/actions";

export type DashboardSnapshot = NonNullable<Awaited<ReturnType<typeof getDashboardSnapshot>>>;

export async function requireDashboardSnapshot(): Promise<DashboardSnapshot> {
  const snapshot = await getDashboardSnapshot();

  if (!snapshot) {
    redirect("/login");
  }

  return snapshot;
}

export function getResolvedPermissions(snapshot: DashboardSnapshot): string[] {
  if (!snapshot.permissions) {
    return [];
  }

  return Array.from(snapshot.permissions.permissions);
}

export function hasOrganizerAccess(snapshot: DashboardSnapshot): boolean {
  return snapshot.contexts.some((context) => context.type === ScopeType.ORGANIZATION);
}

export function hasStaffAccess(snapshot: DashboardSnapshot): boolean {
  return snapshot.contexts.some(
    (context) => context.role === Role.STAFF || context.type === ScopeType.EVENT,
  );
}

export function hasAdminAccess(snapshot: DashboardSnapshot): boolean {
  return getResolvedPermissions(snapshot).includes("platform.admin");
}

export function getActiveContextLabel(snapshot: DashboardSnapshot): string {
  const activeContext = snapshot.activeContext;

  if (!activeContext) {
    return "No active context";
  }

  if (activeContext.type === ScopeType.ORGANIZATION) {
    return `Organizer · ${activeContext.id}`;
  }

  if (activeContext.type === ScopeType.EVENT) {
    return `Staff · ${activeContext.id}`;
  }

  if (activeContext.type === ScopeType.PLATFORM) {
    return `Admin · ${activeContext.id}`;
  }

  return `Attendee · ${activeContext.id}`;
}
