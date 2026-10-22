import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  HealthResponse,
  Product,
  StockShortage,
} from '@pickup-counter/shared';
import { fetchHealth, fetchProducts } from '../api/client';

export interface CartLine {
  product: Product;
  quantity: number;
}

type ToastTone = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  tone: ToastTone;
}

interface AddToCartResult {
  added: number;
  capped: boolean;
}

interface ShopContextValue {
  products: Product[];
  productsLoading: boolean;
  productsError: string | null;
  lastStockSync: number | null;
  refreshProducts: (silent?: boolean) => Promise<Product[]>;
  cart: CartLine[];
  cartCount: number;
  cartTotalPaise: number;
  addToCart: (product: Product, quantity?: number) => AddToCartResult;
  setQuantity: (productId: number, quantity: number) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  reconcileCart: (shortages: StockShortage[]) => void;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toast: ToastState | null;
  showToast: (message: string, tone?: ToastTone) => void;
  clearToast: () => void;
  health: HealthResponse | null;
  holdSeconds: number;
}

const CART_STORAGE_KEY = 'pickup-counter:cart:v2';

const ShopContext = createContext<ShopContextValue | null>(null);

function loadStoredCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((line): line is CartLine => {
        if (!line || typeof line !== 'object') return false;
        const candidate = line as Partial<CartLine>;
        return (
          typeof candidate.quantity === 'number' &&
          candidate.quantity > 0 &&
          !!candidate.product &&
          typeof candidate.product.id === 'number'
        );
      })
      .map((line) => ({ product: line.product, quantity: Math.floor(line.quantity) }));
  } catch {
    return [];
  }
}

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState<boolean>(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [lastStockSync, setLastStockSync] = useState<number | null>(null);
  const [cart, setCart] = useState<CartLine[]>(loadStoredCart);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const clearToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const refreshProducts = useCallback(async (silent = false): Promise<Product[]> => {
    if (!silent) setProductsLoading(true);
    try {
      const data = await fetchProducts();
      setProducts(data);
      setProductsError(null);
      setLastStockSync(Date.now());
      setCart((previous) =>
        previous
          .map((line) => {
            const latest = data.find((product) => product.id === line.product.id);
            if (!latest || latest.availableUnits <= 0) return null;
            return {
              product: latest,
              quantity: Math.min(line.quantity, latest.availableUnits),
            };
          })
          .filter((line): line is CartLine => line !== null),
      );
      return data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not reach the counter inventory.';
      if (!silent) setProductsError(message);
      throw error;
    } finally {
      if (!silent) setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProducts().catch(() => undefined);
    fetchHealth()
      .then(setHealth)
      .catch(() => undefined);
  }, [refreshProducts]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshProducts(true).catch(() => undefined);
    }, 12000);

    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        refreshProducts(true).catch(() => undefined);
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshProducts]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Storage can be unavailable in private mode. The in-memory cart still works.
    }
  }, [cart]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const addToCart = useCallback(
    (product: Product, quantity = 1): AddToCartResult => {
      const liveProduct = products.find((item) => item.id === product.id) ?? product;
      const existing = cart.find((line) => line.product.id === product.id);
      const currentQuantity = existing?.quantity ?? 0;
      const nextQuantity = Math.min(
        currentQuantity + quantity,
        liveProduct.availableUnits,
      );
      const added = Math.max(0, nextQuantity - currentQuantity);
      const capped = currentQuantity + quantity > liveProduct.availableUnits;

      if (added > 0) {
        setCart((previous) => {
          if (existing) {
            return previous.map((line) =>
              line.product.id === product.id
                ? { product: liveProduct, quantity: nextQuantity }
                : line,
            );
          }
          return [...previous, { product: liveProduct, quantity: nextQuantity }];
        });
      }

      return { added, capped };
    },
    [cart, products],
  );

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setCart((previous) =>
      previous
        .map((line) => {
          if (line.product.id !== productId) return line;
          const nextQuantity = Math.max(
            0,
            Math.min(Math.floor(quantity), line.product.availableUnits),
          );
          return nextQuantity === 0 ? null : { ...line, quantity: nextQuantity };
        })
        .filter((line): line is CartLine => line !== null),
    );
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setCart((previous) => previous.filter((line) => line.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const reconcileCart = useCallback((shortages: StockShortage[]) => {
    setCart((previous) =>
      previous
        .map((line) => {
          const shortage = shortages.find((item) => item.productId === line.product.id);
          if (!shortage) return line;
          if (shortage.available <= 0) return null;
          return {
            ...line,
            quantity: Math.min(line.quantity, shortage.available),
            product: {
              ...line.product,
              availableUnits: shortage.available,
            },
          };
        })
        .filter((line): line is CartLine => line !== null),
    );
  }, []);

  const cartCount = useMemo(
    () => cart.reduce((total, line) => total + line.quantity, 0),
    [cart],
  );
  const cartTotalPaise = useMemo(
    () => cart.reduce((total, line) => total + line.product.pricePaise * line.quantity, 0),
    [cart],
  );

  const value: ShopContextValue = {
    products,
    productsLoading,
    productsError,
    lastStockSync,
    refreshProducts,
    cart,
    cartCount,
    cartTotalPaise,
    addToCart,
    setQuantity,
    removeFromCart,
    clearCart,
    reconcileCart,
    isCartOpen,
    openCart: () => setIsCartOpen(true),
    closeCart: () => setIsCartOpen(false),
    toast,
    showToast,
    clearToast,
    health,
    holdSeconds: health?.holdSeconds ?? 120,
  };

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
};

export function useShop(): ShopContextValue {
  const context = useContext(ShopContext);
  if (!context) throw new Error('useShop must be used inside ShopProvider');
  return context;
}
