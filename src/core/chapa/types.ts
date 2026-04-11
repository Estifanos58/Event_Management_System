export interface ChapaCustomer {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
}

export type ChapaResponseStatus = "success" | "failed";

export interface ChapaInitializePayload {
  amount: string;
  currency: string;
  tx_ref: string;
  callback_url: string;
  return_url: string;
  customization: {
    title: string;
    description: string;
  };
  customer: ChapaCustomer;
}

export interface ChapaInitializeResponse {
  status: ChapaResponseStatus;
  message: string;
  data?: {
    checkout_url: string;
  };
}

export interface ChapaVerifyResponse {
  status: ChapaResponseStatus;
  message: string;
  data?: {
    tx_ref: string;
    reference?: string;
    chapa_reference?: string;
    amount: string;
    currency: string;
    status: string;
    mode?: string;
    created_at?: string;
    updated_at?: string;
  };
}

export interface ChapaCallbackPayload {
  trx_ref?: string;
  tx_ref?: string;
  ref_id?: string;
  reference?: string;
  status?: string;
  event?: string;
  data?: {
    tx_ref?: string;
    id?: string;
    ref_id?: string;
    status?: string;
    amount?: string;
    currency?: string;
  };
}

export interface ChapaCancelTransactionResponse {
  status: ChapaResponseStatus;
  message: string;
  data?: {
    tx_ref?: string;
    status?: string;
  };
}

export interface ChapaRefundInitiatePayload {
  reason?: string;
  amount?: string;
  meta?: Record<string, string>;
  reference?: string;
}

export interface ChapaRefundInitiateResponse {
  status: ChapaResponseStatus;
  message: string;
  data?: {
    ref_id?: string;
    payment_reference?: string;
    status?: string;
    amount?: string;
    currency?: string;
    created_at?: string;
    updated_at?: string;
  };
}

export interface ChapaRefundVerifyResponse {
  status: ChapaResponseStatus;
  message: string;
  data?: {
    ref_id?: string;
    payment_reference?: string;
    merchant_reference?: string | null;
    status?: string;
    amount?: string | number;
    currency?: string;
    created_at?: string;
    updated_at?: string;
  };
}
