import { notFound } from "next/navigation";
import { CheckoutFlow } from "@/components/attendee/checkout/checkout-flow";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDiscoverableEventDetail } from "@/domains/discovery/service";
import { getActiveReservationForUser } from "@/domains/ticketing/service";

type CheckoutPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { eventId } = await params;
  const detail = await getDiscoverableEventDetail(eventId);

  if (!detail) {
    notFound();
  }

  const activeReservation = await getActiveReservationForUser(eventId).catch(() => null);

  const initialReservation = activeReservation
    ? {
        id: activeReservation.id,
        expiresAt: activeReservation.expiresAt.toISOString(),
        items: activeReservation.items.map((item: { ticketClassId: string; quantity: number }) => ({
          ticketClassId: item.ticketClassId,
          quantity: item.quantity,
        })),
      }
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Attendee Checkout</CardTitle>
          <CardDescription>
            {detail.title} - {detail.organizer.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          <p>
            Availability: {detail.availability.displayLabel}. Checkout uses reservation and payment route handlers with idempotent submissions.
          </p>
        </CardContent>
      </Card>

      <CheckoutFlow
        eventId={eventId}
        eventTitle={detail.title}
        ticketClasses={detail.ticketClasses}
        initialReservation={initialReservation}
      />
    </div>
  );
}
