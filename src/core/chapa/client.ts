import { env } from "@/core/env";
import type {
  ChapaInitializePayload,
  ChapaInitializeResponse,
  ChapaVerifyResponse,
} from "@/core/chapa/types";

async function chapaFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${env.CHAPA_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CHAPA_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const failure = await response.text();
    throw new Error(`Chapa request failed: ${response.status} ${failure}`);
  }

  return (await response.json()) as T;
}

export async function initializeChapaPayment(payload: ChapaInitializePayload) {
  return chapaFetch<ChapaInitializeResponse>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyChapaPayment(transactionRef: string) {
  return chapaFetch<ChapaVerifyResponse>(`/transaction/verify/${transactionRef}`, {
    method: "GET",
  });
}
