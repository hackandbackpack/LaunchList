// Centralized configuration for LaunchList
// All values can be overridden via VITE_* environment variables

interface StoreConfig {
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface AppLimits {
  maxFileSizeMB: number;
  maxDecklistCards: number;
  orderHoldDays: number;
  orderPrefix: string;
}

interface ApiConfig {
  scryfallRateLimitMs: number;
  pokemonRateLimitMs: number;
  autocompleteDebounceMs: number;
  baseUrl: string;
}

interface Config {
  store: StoreConfig;
  limits: AppLimits;
  api: ApiConfig;
}

function getEnv(key: string, defaultValue: string): string {
  return import.meta.env[key] ?? defaultValue;
}

/**
 * Format phone number from XXX.XXX.XXXX to (XXX) XXX-XXXX
 */
function formatPhoneNumber(phone: string): string {
  // Match XXX.XXX.XXXX or XXXXXXXXXX patterns
  const match = phone.replace(/\D/g, '').match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }
  // Return as-is if doesn't match expected format
  return phone;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = import.meta.env[key];
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const CONFIG: Config = {
  store: {
    name: getEnv('VITE_STORE_NAME', 'Blast Off Gaming'),
    email: getEnv('VITE_STORE_EMAIL', 'contact@blastoffgaming.com'),
    phone: formatPhoneNumber(getEnv('VITE_STORE_PHONE', '555.123.4567')),
    address: getEnv('VITE_STORE_ADDRESS', '123 Main Street, Your City'),
  },
  limits: {
    maxFileSizeMB: getEnvNumber('VITE_MAX_FILE_SIZE_MB', 1),
    maxDecklistCards: getEnvNumber('VITE_MAX_DECKLIST_CARDS', 500),
    orderHoldDays: getEnvNumber('VITE_ORDER_HOLD_DAYS', 7),
    orderPrefix: getEnv('VITE_ORDER_PREFIX', 'LP'),
  },
  api: {
    scryfallRateLimitMs: getEnvNumber('VITE_SCRYFALL_RATE_LIMIT_MS', 100),
    pokemonRateLimitMs: getEnvNumber('VITE_POKEMON_RATE_LIMIT_MS', 200),
    autocompleteDebounceMs: getEnvNumber('VITE_AUTOCOMPLETE_DEBOUNCE_MS', 200),
    baseUrl: getEnv('VITE_API_URL', '/api'),
  },
};
