import { env } from "@/core/env";
import type {
  ChapaCancelTransactionResponse,
  ChapaInitializePayload,
  ChapaInitializeResponse,
  ChapaRefundInitiatePayload,
  ChapaRefundInitiateResponse,
  ChapaRefundVerifyResponse,
  ChapaVerifyResponse,
} from "@/core/chapa/types";

type ChapaFetchInit = RequestInit & {
  useFormUrlEncoded?: boolean;
};

async function chapaFetch<T>(path: string, init: ChapaFetchInit): Promise<T> {
  const { useFormUrlEncoded, ...requestInit } = init;

  const response = await fetch(`${env.CHAPA_BASE_URL}${path}`, {
    ...requestInit,
    headers: {
      Authorization: `Bearer ${env.CHAPA_SECRET_KEY}`,
      "Content-Type": useFormUrlEncoded
        ? "application/x-www-form-urlencoded"
        : "application/json",
      ...(requestInit.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const failure = await response.text();
    throw new Error(`Chapa request failed: ${response.status} ${failure}`);
  }

  return (await response.json()) as T;
}

function toFormEncodedBody(input: ChapaRefundInitiatePayload) {
  const params = new URLSearchParams();

  if (input.reason) {
    params.set("reason", input.reason);
  }

  if (input.amount) {
    params.set("amount", input.amount);
  }

  if (input.reference) {
    params.set("reference", input.reference);
  }

  if (input.meta) {
    Object.entries(input.meta).forEach(([key, value]) => {
      params.set(`meta[${key}]`, value);
    });
  }

  return params.toString();
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

export async function cancelChapaTransaction(transactionRef: string) {
  return chapaFetch<ChapaCancelTransactionResponse>(
    `/transaction/cancel/${transactionRef}`,
    {
      method: "PUT",
    },
  );
}

export async function initiateChapaRefund(
  transactionRef: string,
  payload: ChapaRefundInitiatePayload,
) {
  return chapaFetch<ChapaRefundInitiateResponse>(`/refund/${transactionRef}`, {
    method: "POST",
    body: toFormEncodedBody(payload),
    useFormUrlEncoded: true,
  });
}

export async function verifyChapaRefund(refundReferenceId: string) {
  return chapaFetch<ChapaRefundVerifyResponse>(`/refund/${refundReferenceId}/verify`, {
    method: "GET",
  });
}
