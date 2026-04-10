export { getDashboardSnapshot } from "@/domains/identity/actions";
export {
  createAccessContext,
  requirePermission,
  requireVerifiedOrganization,
  toErrorResponse,
  AuthorizationError,
} from "@/domains/identity/guards";
export {
  getPermissions,
  canAccess,
  canUserAccess,
  listUserContexts,
  resolveOrganizationIdFromContext,
} from "@/domains/identity/permissions";
export {
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type AccessContext,
  type Permission,
  type PermissionResolution,
  type UserContextOption,
} from "@/domains/identity/types";
