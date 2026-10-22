import {
  CancelOrderResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  GetOrderResponse,
  HealthResponse,
  PickupClaimResponse,
  Product,
  StockShortage,
  WebhookResponse,
} from '@pickup-counter/shared';

const BASE_URL = '';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: { shortages?: StockShortage[] } & Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    status: number,
    details?: { shortages?: StockShortage[] } & Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg =
      data.error?.message || data.message || `Request failed with status ${res.status}`;
    const code = data.error?.code || 'REQUEST_FAILED';
    throw new ApiError(errorMsg, code, res.status, data.error?.details);
  }
  return data as T;
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${BASE_URL}/products`, { headers: { Accept: 'application/json' } });
  return handleResponse<Product[]>(res);
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE_URL}/health`);
  return handleResponse<HealthResponse>(res);
}

export async function createOrder(
  items: Array<{ productId: number; quantity: number }>,
): Promise<CreateOrderResponse> {
  const req: CreateOrderRequest = { items };
  const res = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<CreateOrderResponse>(res);
}

export async function fetchOrder(id: string): Promise<GetOrderResponse> {
  const res = await fetch(`${BASE_URL}/orders/${id}`);
  return handleResponse<GetOrderResponse>(res);
}

export async function cancelOrder(id: string): Promise<CancelOrderResponse> {
  const res = await fetch(`${BASE_URL}/orders/${id}/cancel`, { method: 'POST' });
  return handleResponse<CancelOrderResponse>(res);
}

export async function claimPickup(orderId: string): Promise<PickupClaimResponse> {
  const res = await fetch(`${BASE_URL}/orders/${orderId}/pickup-claim`, {
    method: 'POST',
  });
  return handleResponse<PickupClaimResponse>(res);
}

/**
 * Demo-only payment. The server reads the amount and runs the same payment
 * state machine as the signed webhook. No secret ever reaches the browser.
 */
export async function payDemo(orderId: string): Promise<WebhookResponse> {
  const res = await fetch(`${BASE_URL}/payments/demo/${orderId}`, {
    method: 'POST',
  });
  return handleResponse<WebhookResponse>(res);
}
