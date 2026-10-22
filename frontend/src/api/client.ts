import {
  Product,
  CreateOrderRequest,
  CreateOrderResponse,
  GetOrderResponse,
  PickupClaimResponse,
  WebhookPayload,
  WebhookResponse,
} from '@pickup-counter/shared';

const BASE_URL = '';

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data.error?.message || data.message || `Request failed with status ${res.status}`;
    const code = data.error?.code || 'REQUEST_FAILED';
    const err = new Error(errorMsg) as Error & { code?: string; details?: unknown; status?: number };
    err.code = code;
    err.details = data.error?.details;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${BASE_URL}/products`);
  return handleResponse<Product[]>(res);
}

export async function createOrder(items: Array<{ productId: number; quantity: number }>): Promise<CreateOrderResponse> {
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

export async function claimPickup(orderId: string): Promise<PickupClaimResponse> {
  const res = await fetch(`${BASE_URL}/orders/${orderId}/pickup-claim`, {
    method: 'POST',
  });
  return handleResponse<PickupClaimResponse>(res);
}

/**
 * Calculates hex HMAC-SHA256 signature using browser standard Web Crypto API
 */
export async function computeHmacSignature(rawBody: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await window.crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function simulateWebhook(
  payload: WebhookPayload,
  secret: string = 'pickup-secret-key-12345',
  badSig: boolean = false,
): Promise<WebhookResponse> {
  const rawBody = JSON.stringify(payload);
  let signature = await computeHmacSignature(rawBody, secret);

  if (badSig) {
    signature = signature.replace(/[0-9a-f]/, (c) => (c === 'a' ? 'b' : 'a'));
  }

  const res = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': signature,
    },
    body: rawBody,
  });

  return handleResponse<WebhookResponse>(res);
}
