import { Prisma, PrismaClient } from "@prisma/client";
import {
  buildAuditEvents,
  buildAuthData,
  buildCheckIns,
  buildComplianceData,
  buildEvents,
  buildEventSessions,
  buildFinancials,
  buildGates,
  buildInboundProviderEvents,
  buildModeration,
  buildNotifications,
  buildOrders,
  buildOrganizations,
  buildPayments,
  buildReservations,
  buildRoleBindings,
  buildTicketClasses,
  buildTicketTransfers,
  buildTickets,
  buildUsers,
  buildWaitlist,
  buildWebhooks,
  buildFeedback,
} from "./data";
import { seedNow } from "./utils/dates";

const prisma = new PrismaClient();

async function clearDatabase(tx: PrismaClient | Prisma.TransactionClient) {
  await tx.$executeRawUnsafe(
    'ALTER TABLE "AuditEvent" DISABLE TRIGGER "AuditEvent_no_update";',
  );
  await tx.$executeRawUnsafe(
    'ALTER TABLE "AuditEvent" DISABLE TRIGGER "AuditEvent_no_delete";',
  );

  try {
    await tx.notificationDeliveryAttempt.deleteMany();
    await tx.notificationDelivery.deleteMany();
    await tx.notificationPreference.deleteMany();
    await tx.inboundProviderEvent.deleteMany();
    await tx.webhookDeliveryAttempt.deleteMany();
    await tx.webhookOutboxEvent.deleteMany();
    await tx.webhookEndpoint.deleteMany();
    await tx.dataDeletionRequest.deleteMany();
    await tx.policyAcceptance.deleteMany();
    await tx.dataExportJob.deleteMany();
    await tx.auditEvent.deleteMany();
    await tx.settlement.deleteMany();
    await tx.payout.deleteMany();
    await tx.riskCase.deleteMany();
    await tx.abuseReport.deleteMany();
    await tx.feedback.deleteMany();
    await tx.checkInEvent.deleteMany();
    await tx.ticketTransfer.deleteMany();
    await tx.ticket.deleteMany();
    await tx.refund.deleteMany();
    await tx.paymentAttempt.deleteMany();
    await tx.order.deleteMany();
    await tx.reservationItem.deleteMany();
    await tx.reservation.deleteMany();
    await tx.waitlistEntry.deleteMany();
    await tx.gateTicketClassAccess.deleteMany();
    await tx.gateStaffAssignment.deleteMany();
    await tx.gate.deleteMany();
    await tx.ticketClass.deleteMany();
    await tx.eventSession.deleteMany();
    await tx.roleBinding.deleteMany();
    await tx.event.deleteMany();
    await tx.organization.deleteMany();
    await tx.verification.deleteMany();
    await tx.account.deleteMany();
    await tx.session.deleteMany();
    await tx.user.deleteMany();
  } finally {
    await tx.$executeRawUnsafe(
      'ALTER TABLE "AuditEvent" ENABLE TRIGGER "AuditEvent_no_update";',
    );
    await tx.$executeRawUnsafe(
      'ALTER TABLE "AuditEvent" ENABLE TRIGGER "AuditEvent_no_delete";',
    );
  }
}

async function upsertUsers(tx: PrismaClient | Prisma.TransactionClient, users: Prisma.UserCreateManyInput[]) {
  for (const user of users) {
    await tx.user.upsert({
      where: {
        id: user.id,
      },
      update: {
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        updatedAt: user.updatedAt,
      },
      create: user,
    });
  }
}

async function upsertOrganizations(
  tx: PrismaClient | Prisma.TransactionClient,
  organizations: Prisma.OrganizationCreateManyInput[],
) {
  for (const organization of organizations) {
    await tx.organization.upsert({
      where: {
        id: organization.id,
      },
      update: {
        legalName: organization.legalName,
        displayName: organization.displayName,
        kycStatus: organization.kycStatus,
        defaultCurrency: organization.defaultCurrency,
        region: organization.region,
        updatedAt: organization.updatedAt,
      },
      create: organization,
    });
  }
}

async function upsertEvents(tx: PrismaClient | Prisma.TransactionClient, events: Prisma.EventCreateManyInput[]) {
  for (const event of events) {
    await tx.event.upsert({
      where: {
        id: event.id,
      },
      update: {
        title: event.title,
        description: event.description,
        coverImageUrl: event.coverImageUrl,
        galleryImages: event.galleryImages,
        venueMode: event.venueMode,
        registrationType: event.registrationType,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
        virtualMeetingUrl: event.virtualMeetingUrl,
        totalCapacity: event.totalCapacity,
        waitlistEnabled: event.waitlistEnabled,
        slug: event.slug,
        brandingTheme: event.brandingTheme,
        brandingLogoUrl: event.brandingLogoUrl,
        brandingPrimaryColor: event.brandingPrimaryColor,
        brandingAccentColor: event.brandingAccentColor,
        registrationFormConfig: event.registrationFormConfig,
        confirmationEmailTemplate: event.confirmationEmailTemplate,
        reminderEmailTemplate: event.reminderEmailTemplate,
        reminderLeadHours: event.reminderLeadHours,
        organizerAnnouncementTemplate: event.organizerAnnouncementTemplate,
        shareMessage: event.shareMessage,
        referralEnabled: event.referralEnabled,
        referralDefaultCode: event.referralDefaultCode,
        campaignTrackingEnabled: event.campaignTrackingEnabled,
        ticketSalesPaused: event.ticketSalesPaused,
        status: event.status,
        visibility: event.visibility,
        startAt: event.startAt,
        endAt: event.endAt,
        timezone: event.timezone,
        publishAt: event.publishAt,
        updatedAt: event.updatedAt,
      },
      create: event,
    });
  }
}

async function validateSeedRequirements() {
  const [
    eventCount,
    eventWithCoverCount,
    soldOutEvent,
    liveEventCount,
    completedEventCount,
    cancelledEventCount,
    privateEventCount,
    virtualEventCount,
    waitlistCount,
    checkInCount,
    feedbackCount,
    settlementCount,
  ] = await Promise.all([
    prisma.event.count(),
    prisma.event.count({
      where: {
        coverImageUrl: {
          not: null,
        },
      },
    }),
    prisma.event.findFirst({
      where: {
        title: {
          contains: "Tech Conference 2026",
        },
      },
      select: {
        id: true,
      },
    }),
    prisma.event.count({
      where: {
        status: "LIVE",
      },
    }),
    prisma.event.count({
      where: {
        status: "COMPLETED",
      },
    }),
    prisma.event.count({
      where: {
        status: "CANCELLED",
      },
    }),
    prisma.event.count({
      where: {
        visibility: "PRIVATE",
      },
    }),
    prisma.event.count({
      where: {
        venueMode: "VIRTUAL",
        virtualMeetingUrl: {
          not: null,
        },
      },
    }),
    prisma.waitlistEntry.count(),
    prisma.checkInEvent.count(),
    prisma.feedback.count(),
    prisma.settlement.count(),
  ]);

  if (!soldOutEvent) {
    throw new Error("Required sold-out scenario event missing.");
  }

  const coverRatio = eventCount > 0 ? eventWithCoverCount / eventCount : 0;

  if (coverRatio < 0.8) {
    throw new Error(`Event cover image ratio too low: ${(coverRatio * 100).toFixed(1)}%.`);
  }

  if (liveEventCount < 1) {
    throw new Error("Required LIVE event scenario missing.");
  }

  if (completedEventCount < 1) {
    throw new Error("Required COMPLETED event scenario missing.");
  }

  if (cancelledEventCount < 1) {
    throw new Error("Required CANCELLED event scenario missing.");
  }

  if (privateEventCount < 1) {
    throw new Error("Required PRIVATE event scenario missing.");
  }

  if (virtualEventCount < 1) {
    throw new Error("Required VIRTUAL event scenario with meeting URL missing.");
  }

  if (waitlistCount < 10) {
    throw new Error("Waitlist scenario data is insufficient.");
  }

  if (checkInCount < 10) {
    throw new Error("Check-in scenario data is insufficient.");
  }

  if (feedbackCount < 10) {
    throw new Error("Feedback scenario data is insufficient.");
  }

  if (settlementCount < 10) {
    throw new Error("Settlement scenario data is insufficient.");
  }
}

async function main() {
  const users = buildUsers(seedNow);
  const organizations = buildOrganizations(seedNow);
  const events = buildEvents({
    now: seedNow,
    orgIds: organizations.profiles.map((organization) => organization.id),
    organizerIds: users.organizerIds,
  });
  const auth = buildAuthData({
    now: seedNow,
    users: users.profiles,
    organizations: organizations.profiles,
    events: events.profiles,
  });
  const ticketClasses = buildTicketClasses(events.profiles);
  const eventSessions = buildEventSessions(events.profiles);
  const gates = buildGates({
    events: events.profiles,
    ticketClasses: ticketClasses.profiles,
    staffIds: users.staffIds,
  });
  const roleBindings = buildRoleBindings({
    now: seedNow,
    users: users.profiles,
    organizations: organizations.profiles,
    events: events.profiles,
    gateStaffAssignments: gates.gateStaffAssignments,
  });
  const reservations = buildReservations({
    now: seedNow,
    events: events.profiles,
    attendeeIds: users.attendeeIds,
    ticketClasses: ticketClasses.profiles,
  });
  const orders = buildOrders({
    reservations: reservations.reservationProfiles,
    reservationItems: reservations.reservationItemProfiles,
    ticketClasses: ticketClasses.profiles,
  });
  const payments = buildPayments({
    orders: orders.orderProfiles,
    fallbackRequestedBy: users.superAdminId,
  });
  const tickets = buildTickets({
    orders: orders.orderProfiles,
    reservations: reservations.reservationProfiles,
    reservationItems: reservations.reservationItemProfiles,
    events: events.profiles,
    attendeeIds: users.attendeeIds,
    refundedOrderIds: payments.refundedOrderIds,
  });
  const waitlist = buildWaitlist({
    now: seedNow,
    soldOutEventId: events.scenarioEventIds.soldOut,
    attendeeIds: users.attendeeIds,
    ticketClasses: ticketClasses.profiles,
  });
  const transfers = buildTicketTransfers({
    tickets: tickets.profiles,
    attendeeIds: users.attendeeIds,
  });
  const checkIns = buildCheckIns({
    tickets: tickets.profiles,
    events: events.profiles,
    gates: gates.gates,
    gateStaffAssignments: gates.gateStaffAssignments,
  });
  const feedback = buildFeedback({
    tickets: tickets.profiles,
    events: events.profiles,
  });
  const moderation = buildModeration({
    now: seedNow,
    users: users.profiles,
    events: events.profiles,
    organizations: organizations.profiles,
  });
  const financials = buildFinancials({
    events: events.profiles,
    orders: orders.orderProfiles,
  });
  const notifications = buildNotifications({
    now: seedNow,
    users: users.profiles,
    events: events.profiles,
    orders: orders.orderProfiles,
  });
  const webhooks = buildWebhooks({
    now: seedNow,
    organizations: organizations.profiles,
    events: events.profiles,
    users: users.profiles,
  });
  const inboundProviderEvents = buildInboundProviderEvents({
    now: seedNow,
    organizations: organizations.profiles,
    events: events.profiles,
  });
  const compliance = buildComplianceData({
    now: seedNow,
    users: users.profiles,
    organizations: organizations.profiles,
    events: events.profiles,
  });
  const auditEvents = buildAuditEvents({
    now: seedNow,
    users: users.profiles,
    events: events.profiles,
    orders: orders.orderProfiles,
    checkIns,
  });

  await clearDatabase(prisma);

  await upsertUsers(prisma, users.users);
  await upsertOrganizations(prisma, organizations.organizations);
  await upsertEvents(prisma, events.events);

  await prisma.$transaction([
    prisma.session.createMany({ data: auth.sessions }),
    prisma.account.createMany({ data: auth.accounts }),
    prisma.verification.createMany({ data: auth.verifications }),
  ]);

  await prisma.$transaction([
    prisma.eventSession.createMany({ data: eventSessions }),
    prisma.ticketClass.createMany({ data: ticketClasses.ticketClasses }),
    prisma.gate.createMany({ data: gates.gates }),
  ]);

  await prisma.$transaction([
    prisma.gateTicketClassAccess.createMany({ data: gates.gateTicketClassAccesses }),
    prisma.gateStaffAssignment.createMany({ data: gates.gateStaffAssignments }),
    prisma.roleBinding.createMany({ data: roleBindings }),
  ]);

  await prisma.$transaction([
    prisma.waitlistEntry.createMany({ data: waitlist }),
    prisma.reservation.createMany({ data: reservations.reservations }),
    prisma.reservationItem.createMany({ data: reservations.reservationItems }),
  ]);

  await prisma.$transaction([
    prisma.order.createMany({ data: orders.orders }),
    prisma.paymentAttempt.createMany({ data: payments.paymentAttempts }),
  ]);

  if (payments.refunds.length > 0) {
    await prisma.refund.createMany({ data: payments.refunds });
  }

  await prisma.ticket.createMany({ data: tickets.tickets });

  const postTicketOps: Prisma.PrismaPromise<unknown>[] = [
    prisma.checkInEvent.createMany({ data: checkIns }),
    prisma.feedback.createMany({ data: feedback }),
  ];

  if (transfers.length > 0) {
    postTicketOps.push(prisma.ticketTransfer.createMany({ data: transfers }));
  }

  await prisma.$transaction(postTicketOps);

  await prisma.$transaction([
    prisma.payout.createMany({ data: financials.payouts }),
    prisma.settlement.createMany({ data: financials.settlements }),
    prisma.abuseReport.createMany({ data: moderation.abuseReports }),
    prisma.riskCase.createMany({ data: moderation.riskCases }),
  ]);

  await prisma.$transaction([
    prisma.notificationPreference.createMany({ data: notifications.preferences }),
    prisma.notificationDelivery.createMany({ data: notifications.deliveries }),
    prisma.notificationDeliveryAttempt.createMany({ data: notifications.attempts }),
  ]);

  await prisma.$transaction([
    prisma.webhookEndpoint.createMany({ data: webhooks.endpoints }),
    prisma.webhookOutboxEvent.createMany({ data: webhooks.outboxEvents }),
    prisma.webhookDeliveryAttempt.createMany({ data: webhooks.deliveryAttempts }),
    prisma.inboundProviderEvent.createMany({ data: inboundProviderEvents }),
  ]);

  await prisma.$transaction([
    prisma.policyAcceptance.createMany({ data: compliance.policyAcceptances }),
    prisma.dataDeletionRequest.createMany({ data: compliance.dataDeletionRequests }),
    prisma.dataExportJob.createMany({ data: compliance.dataExportJobs }),
    prisma.auditEvent.createMany({ data: auditEvents, skipDuplicates: true }),
  ]);

  await validateSeedRequirements();

  const summary = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.roleBinding.count(),
    prisma.event.count(),
    prisma.eventSession.count(),
    prisma.gate.count(),
    prisma.ticketClass.count(),
    prisma.reservation.count(),
    prisma.reservationItem.count(),
    prisma.order.count(),
    prisma.paymentAttempt.count(),
    prisma.refund.count(),
    prisma.ticket.count(),
    prisma.checkInEvent.count(),
    prisma.waitlistEntry.count(),
    prisma.ticketTransfer.count(),
    prisma.feedback.count(),
    prisma.abuseReport.count(),
    prisma.riskCase.count(),
    prisma.settlement.count(),
    prisma.payout.count(),
    prisma.notificationDelivery.count(),
    prisma.notificationDeliveryAttempt.count(),
    prisma.webhookEndpoint.count(),
    prisma.webhookOutboxEvent.count(),
    prisma.webhookDeliveryAttempt.count(),
    prisma.inboundProviderEvent.count(),
    prisma.policyAcceptance.count(),
    prisma.dataDeletionRequest.count(),
    prisma.dataExportJob.count(),
    prisma.auditEvent.count(),
  ]);

  const labels = [
    "users",
    "organizations",
    "role bindings",
    "events",
    "event sessions",
    "gates",
    "ticket classes",
    "reservations",
    "reservation items",
    "orders",
    "payment attempts",
    "refunds",
    "tickets",
    "check-ins",
    "waitlist entries",
    "ticket transfers",
    "feedback",
    "abuse reports",
    "risk cases",
    "settlements",
    "payouts",
    "notification deliveries",
    "notification attempts",
    "webhook endpoints",
    "webhook outbox events",
    "webhook delivery attempts",
    "inbound provider events",
    "policy acceptances",
    "data deletion requests",
    "data export jobs",
    "audit events",
  ];

  console.log("Seed completed:");
  labels.forEach((label, index) => {
    console.log(`- ${summary[index]} ${label}`);
  });

  console.log("Scenario checks:");
  console.log(`- Sold-out event: ${events.scenarioEventIds.soldOut}`);
  console.log(`- Live event: ${events.scenarioEventIds.live}`);
  console.log(`- Completed event: ${events.scenarioEventIds.completed}`);
  console.log(`- Cancelled event: ${events.scenarioEventIds.cancelled}`);
  console.log(`- Private event: ${events.scenarioEventIds.privateEvent}`);
  console.log(`- Virtual event: ${events.scenarioEventIds.virtualEvent}`);
  console.log("- Coverage exceptions documented for low-volume admin models (none skipped).\n");
}

main()
  .catch((error) => {
    console.error("Seed failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
