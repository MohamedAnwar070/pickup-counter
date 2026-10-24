import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { CreateOrderResponse, OrderStatus } from '../common';
import { ApiError, fetchOrder } from '../api/client';

export interface SavedOrder {
  id: string;
  totalPaise: number;
  createdAt: number;
  status: OrderStatus;
  lockerNumber?: number | null;
}

interface OrdersContextValue {
  orders: SavedOrder[];
  activeOrder: SavedOrder | null;
  rememberOrder: (order: CreateOrderResponse) => void;
  updateOrderStatus: (id: string, status: OrderStatus, lockerNumber?: number | null) => void;
  forgetOrder: (id: string) => void;
  refreshSavedOrders: () => Promise<void>;
}

const ORDERS_STORAGE_KEY = 'pickup-counter:orders:v1';
const OrdersContext = createContext<OrdersContextValue | null>(null);

function loadOrders(): SavedOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (order): order is SavedOrder =>
        !!order &&
        typeof order === 'object' &&
        typeof (order as SavedOrder).id === 'string' &&
        typeof (order as SavedOrder).totalPaise === 'number',
    );
  } catch {
    return [];
  }
}

export const OrdersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [orders, setOrders] = useState<SavedOrder[]>(loadOrders);

  useEffect(() => {
    try {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    } catch {
      // Local history is a convenience; the order page can still be reached by URL.
    }
  }, [orders]);

  const refreshSavedOrders = useCallback(async () => {
    if (orders.length === 0) return;
    const candidates = orders.slice(0, 10);

    await Promise.allSettled(
      candidates.map(async (saved) => {
        try {
          const latest = await fetchOrder(saved.id);
          setOrders((previous) =>
            previous.map((order) =>
              order.id === saved.id
                ? {
                    ...order,
                    status: latest.status,
                    totalPaise: latest.totalPaise,
                    lockerNumber: latest.lockerNumber ?? order.lockerNumber,
                  }
                : order,
            ),
          );
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            setOrders((previous) => previous.filter((order) => order.id !== saved.id));
          }
        }
      }),
    );
  }, [orders]);

  useEffect(() => {
    const initial = loadOrders();
    if (initial.length === 0) return;
    let cancelled = false;

    (async () => {
      await Promise.allSettled(
        initial.slice(0, 10).map(async (saved) => {
          try {
            const latest = await fetchOrder(saved.id);
            if (cancelled) return;
            setOrders((previous) =>
              previous.map((order) =>
                order.id === saved.id
                  ? {
                      ...order,
                      status: latest.status,
                      totalPaise: latest.totalPaise,
                      lockerNumber: latest.lockerNumber ?? order.lockerNumber,
                    }
                  : order,
              ),
            );
          } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
              if (cancelled) return;
              setOrders((previous) => previous.filter((order) => order.id !== saved.id));
            }
            // Keep the saved entry when the API is temporarily unavailable.
          }
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
    // Run once on application start; explicit refresh is available elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rememberOrder = useCallback((order: CreateOrderResponse) => {
    setOrders((previous) => {
      const next: SavedOrder = {
        id: order.orderId,
        totalPaise: order.totalPaise,
        createdAt: Date.now(),
        status: order.status,
      };
      return [next, ...previous.filter((item) => item.id !== order.orderId)];
    });
  }, []);

  const updateOrderStatus = useCallback(
    (id: string, status: OrderStatus, lockerNumber?: number | null) => {
      setOrders((previous) =>
        previous.map((order) =>
          order.id === id
            ? { ...order, status, lockerNumber: lockerNumber ?? order.lockerNumber }
            : order,
        ),
      );
    },
    [],
  );

  const forgetOrder = useCallback((id: string) => {
    setOrders((previous) => previous.filter((order) => order.id !== id));
  }, []);

  const activeOrder = useMemo(() => {
    return (
      orders.find(
        (order) =>
          order.status === 'pending' ||
          order.status === 'paid' ||
          order.status === 'needs_review',
      ) ?? null
    );
  }, [orders]);

  return (
    <OrdersContext.Provider
      value={{
        orders,
        activeOrder,
        rememberOrder,
        updateOrderStatus,
        forgetOrder,
        refreshSavedOrders,
      }}
    >
      {children}
    </OrdersContext.Provider>
  );
};

export function useOrders(): OrdersContextValue {
  const context = useContext(OrdersContext);
  if (!context) throw new Error('useOrders must be used inside OrdersProvider');
  return context;
}
