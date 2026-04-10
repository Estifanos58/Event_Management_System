import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { getFinancialReconciliationReport } from "@/domains/payments/service";
import type { FinancialReconciliationReportInput } from "@/domains/payments/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const url = new URL(request.url);

    const report = await getFinancialReconciliationReport(
      eventId,
      {
        periodStart: url.searchParams.get("periodStart") ?? undefined,
        periodEnd: url.searchParams.get("periodEnd") ?? undefined,
      } as unknown as FinancialReconciliationReportInput,
    );

    return Response.json({
      report,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
