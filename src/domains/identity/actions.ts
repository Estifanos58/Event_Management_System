"use server";

import { NotificationType, Role, ScopeType } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import { auth } from "@/core/auth/auth";
import {
  authHeaders,
  getServerSessionOrNull,
  resolveActiveContext,
} from "@/core/auth/session";
import { prisma } from "@/core/db/prisma";
import {
  getPermissions,
  listUserContexts,
} from "@/domains/identity/permissions";
import { enqueueSystemNotification } from "@/domains/notifications/service";
import {
  ROLE_DEFAULT_PERMISSIONS,
  type AccessContext,
} from "@/domains/identity/types";

export type ActionState = {
  error?: string;
  success?: string;
};

const signInSchema = z.object({
  email: z.email("A valid email address is required."),
  password: z.string().min(1, "Password is required."),
});

const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must contain at least 2 characters."),
  email: z.email("A valid email address is required."),
  password: z
    .string()
    .min(8, "Password must contain at least 8 characters."),
});

const onboardingSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(2, "Legal name must contain at least 2 characters."),
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must contain at least 2 characters."),
  defaultCurrency: z
    .string()
    .trim()
    .length(3, "Currency must be a 3-letter code.")
    .transform((value) => value.toUpperCase()),
  region: z
    .string()
    .trim()
    .min(2, "Region must contain at least 2 characters."),
});

const switchContextSchema = z.object({
  contextType: z.enum(ScopeType),
  contextId: z.string().min(1, "Context is required."),
});

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function actionError(error: unknown): ActionState {
  if (error instanceof Error) {
    return { error: error.message };
  }

  return {
    error: "Unexpected error occurred.",
  };
}

async function ensurePersonalRoleBinding(userId: string) {
  await prisma.roleBinding.upsert({
    where: {
      userId_role_scopeType_scopeId: {
        userId,
        role: Role.ATTENDEE,
        scopeType: ScopeType.PERSONAL,
        scopeId: userId,
      },
    },
    update: {
      permissions: ROLE_DEFAULT_PERMISSIONS[Role.ATTENDEE],
    },
    create: {
      userId,
      role: Role.ATTENDEE,
      scopeType: ScopeType.PERSONAL,
      scopeId: userId,
      permissions: ROLE_DEFAULT_PERMISSIONS[Role.ATTENDEE],
    },
  });
}

async function persistActiveContext(context: AccessContext) {
  await auth.api.updateSession({
    headers: await authHeaders(),
    body: {
      activeContextType: context.type,
      activeContextId: context.id,
    },
  });
}

function resolveAuthUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybeUser = (payload as { user?: { id?: unknown } }).user;

  if (!maybeUser || typeof maybeUser !== "object") {
    return null;
  }

  return typeof maybeUser.id === "string" ? maybeUser.id : null;
}

export async function signInAction(
  _state: ActionState | undefined,
  formData: FormData,
): Promise<ActionState | undefined> {
  const parsed = signInSchema.safeParse({
    email: getString(formData, "email"),
    password: getString(formData, "password"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid login details.",
    };
  }

  let userId: string | null = null;

  try {
    const signInResult = await auth.api.signInEmail({
      headers: await authHeaders(),
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
    });

    userId = resolveAuthUserId(signInResult);

    if (!userId) {
      return {
        error: "Unable to establish session. Please try again.",
      };
    }

    await ensurePersonalRoleBinding(userId);
  } catch (error) {
    return actionError(error);
  }

  redirect("/attendee/dashboard");
}

export async function signUpAction(
  _state: ActionState | undefined,
  formData: FormData,
): Promise<ActionState | undefined> {
  const parsed = signUpSchema.safeParse({
    name: getString(formData, "name"),
    email: getString(formData, "email"),
    password: getString(formData, "password"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid registration details.",
    };
  }

  let userId: string | null = null;

  try {
    const signUpResult = await auth.api.signUpEmail({
      headers: await authHeaders(),
      body: parsed.data,
    });

    userId = resolveAuthUserId(signUpResult);

    if (!userId) {
      return {
        error: "Unable to establish session. Please try again.",
      };
    }

    await ensurePersonalRoleBinding(userId);

    await enqueueSystemNotification({
      userIds: [userId],
      type: NotificationType.WELCOME,
      subject: "Welcome to Dinkinesh - EEMS",
      content: "Your account is active and ready for event discovery and ticketing.",
      idempotencyKeyBase: `txn:welcome:${userId}`,
      metadata: {
        recipientName: parsed.data.name,
      },
      maxAttempts: 6,
    }).catch((error) => {
      console.warn("Failed to enqueue welcome notification", {
        userId,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  } catch (error) {
    return actionError(error);
  }

  redirect("/attendee/dashboard");
}

export async function signOutAction(): Promise<void> {
  await auth.api.signOut({
    headers: await authHeaders(),
  });

  redirect("/login");
}

export async function onboardOrganizationAction(
  _state: ActionState | undefined,
  formData: FormData,
): Promise<ActionState | undefined> {
  const parsed = onboardingSchema.safeParse({
    legalName: getString(formData, "legalName"),
    displayName: getString(formData, "displayName"),
    defaultCurrency: getString(formData, "defaultCurrency"),
    region: getString(formData, "region"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid organization details.",
    };
  }

  const session = await getServerSessionOrNull();
  if (!session) {
    return {
      error: "Sign in required before creating an organization.",
    };
  }

  try {
    const organization = await prisma.$transaction(async (tx) => {
      const createdOrganization = await tx.organization.create({
        data: {
          legalName: parsed.data.legalName,
          displayName: parsed.data.displayName,
          defaultCurrency: parsed.data.defaultCurrency,
          region: parsed.data.region,
        },
      });

      await tx.roleBinding.upsert({
        where: {
          userId_role_scopeType_scopeId: {
            userId: session.user.id,
            role: Role.ORGANIZER,
            scopeType: ScopeType.ORGANIZATION,
            scopeId: createdOrganization.id,
          },
        },
        update: {
          permissions: ROLE_DEFAULT_PERMISSIONS[Role.ORGANIZER],
          organizationId: createdOrganization.id,
        },
        create: {
          userId: session.user.id,
          role: Role.ORGANIZER,
          scopeType: ScopeType.ORGANIZATION,
          scopeId: createdOrganization.id,
          permissions: ROLE_DEFAULT_PERMISSIONS[Role.ORGANIZER],
          organizationId: createdOrganization.id,
        },
      });

      return createdOrganization;
    });

    await persistActiveContext({
      type: ScopeType.ORGANIZATION,
      id: organization.id,
    });

    await writeAuditEvent({
      actorId: session.user.id,
      action: "organization.onboarded",
      scopeType: ScopeType.ORGANIZATION,
      scopeId: organization.id,
      targetType: "Organization",
      targetId: organization.id,
      newValue: {
        displayName: organization.displayName,
      },
    });

    await enqueueSystemNotification({
      orgId: organization.id,
      userIds: [session.user.id],
      type: NotificationType.ORGANIZATION_CREATED,
      subject: `Organization created: ${organization.displayName}`,
      content: "Your organizer workspace was provisioned successfully.",
      idempotencyKeyBase: `txn:organization-created:${organization.id}:${session.user.id}`,
      metadata: {
        displayName: organization.displayName,
        legalName: organization.legalName,
        defaultCurrency: organization.defaultCurrency,
        region: organization.region,
      },
      maxAttempts: 6,
    }).catch((error) => {
      console.warn("Failed to enqueue organization created notification", {
        organizationId: organization.id,
        actorId: session.user.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    });

    redirect("/organizer/dashboard");
  } catch (error) {
    return actionError(error);
  }
}

export async function switchContextAction(
  _state: ActionState | undefined,
  formData: FormData,
): Promise<ActionState | undefined> {
  const parsed = switchContextSchema.safeParse({
    contextType: getString(formData, "contextType"),
    contextId: getString(formData, "contextId"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid context selection.",
    };
  }

  const session = await getServerSessionOrNull();
  if (!session) {
    return {
      error: "Sign in required before switching context.",
    };
  }

  const context: AccessContext = {
    type: parsed.data.contextType,
    id: parsed.data.contextId,
  };

  const permissions = await getPermissions(session.user.id, context);
  if (permissions.permissions.size === 0) {
    await writeAuditEvent({
      actorId: session.user.id,
      action: "authorization.deny",
      scopeType: context.type,
      scopeId: context.id,
      targetType: "Context",
      targetId: context.id,
      reason: "no_permissions_in_context",
    });

    return {
      error: "You cannot switch to the selected context.",
    };
  }

  await persistActiveContext(context);
  redirect("/context");
}

export async function switchContextFormAction(formData: FormData) {
  const state = await switchContextAction(undefined, formData);

  if (state?.error) {
    redirect("/context");
  }
}

export async function getDashboardSnapshot() {
  const session = await getServerSessionOrNull();
  if (!session) {
    return null;
  }

  const contexts = await listUserContexts(session.user.id);
  const activeContext = resolveActiveContext(session, session.user.id);

  const permissions = activeContext
    ? await getPermissions(session.user.id, activeContext)
    : null;

  return {
    session,
    contexts,
    activeContext,
    permissions,
  };
}
