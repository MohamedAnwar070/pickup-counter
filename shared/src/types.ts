import { ORDER_STATUSES, WEBHOOK_OUTCOMES, REVIEW_REASONS } from './constants';

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type WebhookOutcome = (typeof WEBHOOK_OUTCOMES)[number];
export type ReviewReason = (typeof REVIEW_REASONS)[keyof typeof REVIEW_REASONS];

export interface Product {
  id: number;
  name: string;
  pricePaise: number;
  stock: number;
  availableUnits: number;
}

export interface OrderItem {
  orderId: string;
  productId: number;
  quantity: number;
  unitPricePaise: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  totalPaise: number;
  expiresAt: string;
  paidAt?: string | null;
  paidAmountPaise?: number | null;
  reviewReason?: ReviewReason | null;
  refundFlag: boolean;
  pickedUpAt?: string | null;
  createdAt: string;
}

export interface CreateOrderItemInput {
  productId: number;
  quantity: number;
}

export interface CreateOrderRequest {
  items: CreateOrderItemInput[];
}

export interface CreateOrderResponse {
  orderId: string;
  status: OrderStatus;
  totalPaise: number;
  expiresInSeconds: number;
}

export interface GetOrderResponse {
  id: string;
  status: OrderStatus;
  totalPaise: number;
  expiresInSeconds: number;
  reviewReason?: string | null;
  refundFlag?: boolean;
  items?: Array<{
    productId: number;
    name?: string;
    quantity: number;
    unitPricePaise: number;
  }>;
}

export interface WebhookPayload {
  eventId?: string;
  event_id?: string;
  orderId?: string;
  order_id?: string;
  amountPaise?: number;
  amount_paise?: number;
  status: string;
}

export interface WebhookResponse {
  outcome?: WebhookOutcome;
  duplicate?: boolean;
}

export interface PickupClaimResponse {
  status: 'picked_up';
}

export interface AppErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
