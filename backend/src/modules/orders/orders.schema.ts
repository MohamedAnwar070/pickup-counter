import { z } from 'zod';

export const orderItemInputSchema = z.object({
  productId: z.number().int().positive({ message: 'productId must be a positive integer' }),
  quantity: z.number().int().positive({ message: 'quantity must be a positive integer' }),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, 'Order must contain at least one item'),
});

export type CreateOrderDto = z.infer<typeof createOrderSchema>;

/**
 * Pure function: merges items with duplicate product IDs by summing their quantities.
 * Preserves the order of first appearance.
 */
export function mergeLineItems(
  items: Array<{ productId: number; quantity: number }>,
): Array<{ productId: number; quantity: number }> {
  const map = new Map<number, number>();
  for (const item of items) {
    const existing = map.get(item.productId) || 0;
    map.set(item.productId, existing + item.quantity);
  }
  return Array.from(map.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}
