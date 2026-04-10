export interface ChapaCustomer {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
}

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
  status: "success" | "failed";
  message: string;
  data?: {
    checkout_url: string;
  };
}

export interface ChapaVerifyResponse {
  status: "success" | "failed";
  message: string;
  data?: {
    tx_ref: string;
    amount: string;
    currency: string;
    status: string;
  };
}
