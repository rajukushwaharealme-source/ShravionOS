export const SHRAVION_PRODUCTS_STORAGE_KEY = 'focusApp.shravionProducts.v1';
export const SHRAVION_PRODUCTS_UPDATED_EVENT = 'shravion-products-updated';

export type ShravionProduct = {
  id: string;
  name: string;
  url: string;
  description: string;
};

export const DEFAULT_SHRAVION_PRODUCTS: ShravionProduct[] = [];

const normalizeUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const normalizeShravionProducts = (value: any): ShravionProduct[] => {
  if (!Array.isArray(value)) return DEFAULT_SHRAVION_PRODUCTS;

  return value
    .map((item, index) => ({
      id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `product-${index + 1}`,
      name: typeof item?.name === 'string' ? item.name.trim() : '',
      url: typeof item?.url === 'string' ? normalizeUrl(item.url) : '',
      description: typeof item?.description === 'string' ? item.description.trim() : ''
    }))
    .filter((item) => item.name && item.url);
};

export const readLocalShravionProducts = (): ShravionProduct[] => {
  if (typeof window === 'undefined') return DEFAULT_SHRAVION_PRODUCTS;

  try {
    const raw = window.localStorage.getItem(SHRAVION_PRODUCTS_STORAGE_KEY);
    return raw ? normalizeShravionProducts(JSON.parse(raw)) : DEFAULT_SHRAVION_PRODUCTS;
  } catch (error) {
    console.error('Could not read Shravion products', error);
    return DEFAULT_SHRAVION_PRODUCTS;
  }
};

export const saveLocalShravionProducts = (products: ShravionProduct[]) => {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(SHRAVION_PRODUCTS_STORAGE_KEY, JSON.stringify(normalizeShravionProducts(products)));
  window.dispatchEvent(new CustomEvent(SHRAVION_PRODUCTS_UPDATED_EVENT));
};
