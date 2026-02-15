import type {
  LoginResponse,
  SessionResponse,
  OrderSubmitResponse,
  OrderLookupResponse,
  OrderLineItemsResponse,
  OrderWithItemsResponse,
  OrdersListResponse,
  UpdateOrderResponse,
  UpdateLineItemResponse,
  PokemonTcgResponse,
  SubmitOrderInput,
  UpdateOrderInput,
  UpdateLineItemInput,
  GetOrdersParams,
  DeckRequest,
  DeckLineItem,
  StaffUsersListResponse,
  CreateUserInput,
  CreateUserResponse,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Token management
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('auth_token');
  }
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
  localStorage.removeItem('auth_token');
}

// Generic fetch wrapper
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = getAuthToken();
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.error || `HTTP ${response.status}`,
      response.status,
      errorData.code
    );
  }

  return response.json();
}

// Auth API
export const auth = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(response.token);
    return response;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' });
    } finally {
      clearAuthToken();
    }
  },

  async getSession(): Promise<SessionResponse | null> {
    const token = getAuthToken();
    if (!token) return null;

    try {
      return await apiFetch<SessionResponse>('/auth/session');
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        clearAuthToken();
        return null;
      }
      throw err;
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiFetch<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async requestPasswordReset(email: string): Promise<void> {
    await apiFetch<{ message: string }>('/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await apiFetch<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },
};

async function getCsrfToken(): Promise<string> {
  const response = await fetch(`${API_BASE}/csrf-token`);
  const data = await response.json();
  return data.token;
}

// Orders API (public)
export const orders = {
  async submit(input: SubmitOrderInput): Promise<OrderSubmitResponse> {
    const csrfToken = await getCsrfToken();
    return apiFetch<OrderSubmitResponse>('/orders', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(input),
    });
  },

  async lookup(orderNumber: string, email: string): Promise<DeckRequest> {
    const response = await apiFetch<OrderLookupResponse>('/orders/lookup', {
      method: 'POST',
      body: JSON.stringify({ orderNumber, email }),
    });
    return response.order;
  },

  async getLineItems(orderId: string, email: string): Promise<DeckLineItem[]> {
    const response = await apiFetch<OrderLineItemsResponse>(
      `/orders/${orderId}/items?email=${encodeURIComponent(email)}`
    );
    return response.lineItems;
  },
};

// Staff API (requires auth)
export const staff = {
  async getOrders(params: GetOrdersParams = {}): Promise<OrdersListResponse> {
    const searchParams = new URLSearchParams();
    if (params.limit !== undefined) searchParams.set('limit', params.limit.toString());
    if (params.offset !== undefined) searchParams.set('offset', params.offset.toString());
    if (params.status) searchParams.set('status', params.status);

    const queryString = searchParams.toString();
    const endpoint = queryString ? `/staff/orders?${queryString}` : '/staff/orders';
    return apiFetch<OrdersListResponse>(endpoint);
  },

  async getOrder(orderId: string): Promise<OrderWithItemsResponse> {
    return apiFetch<OrderWithItemsResponse>(`/staff/orders/${orderId}`);
  },

  async updateOrder(orderId: string, updates: UpdateOrderInput): Promise<DeckRequest> {
    const response = await apiFetch<UpdateOrderResponse>(`/staff/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return response.order;
  },

  async getOrderItems(orderId: string): Promise<DeckLineItem[]> {
    const response = await apiFetch<OrderLineItemsResponse>(`/staff/orders/${orderId}/items`);
    return response.lineItems;
  },

  async updateLineItem(
    orderId: string,
    itemId: string,
    updates: UpdateLineItemInput
  ): Promise<DeckLineItem> {
    const response = await apiFetch<UpdateLineItemResponse>(
      `/staff/orders/${orderId}/items/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
    return response.lineItem;
  },

  async deleteLineItem(orderId: string, itemId: string): Promise<void> {
    await apiFetch<{ success: boolean }>(`/staff/orders/${orderId}/items/${itemId}`, {
      method: 'DELETE',
    });
  },
};

// Notifications API (requires auth)
export const notifications = {
  async send(orderId: string, type: 'confirmation' | 'ready'): Promise<void> {
    await apiFetch<{ success: boolean }>('/notifications/send', {
      method: 'POST',
      body: JSON.stringify({ orderId, type }),
    });
  },
};

// Admin API (requires admin auth)
export const admin = {
  async getUsers(): Promise<StaffUsersListResponse> {
    return apiFetch<StaffUsersListResponse>('/admin/users');
  },

  async createUser(input: CreateUserInput): Promise<CreateUserResponse> {
    return apiFetch<CreateUserResponse>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async deleteUser(userId: string): Promise<void> {
    await apiFetch<{ message: string }>(`/admin/users/${userId}`, {
      method: 'DELETE',
    });
  },
};

// Pokemon TCG Proxy
export const pokemonTcg = {
  async search(query: string): Promise<PokemonTcgResponse> {
    return apiFetch<PokemonTcgResponse>(
      `/proxy/pokemon-tcg?action=search&query=${encodeURIComponent(query)}`
    );
  },

  async getCard(id: string): Promise<PokemonTcgResponse> {
    return apiFetch<PokemonTcgResponse>(
      `/proxy/pokemon-tcg?action=card&id=${encodeURIComponent(id)}`
    );
  },
};

// Default export with all APIs
const api = {
  auth,
  orders,
  staff,
  admin,
  notifications,
  pokemonTcg,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
};

export default api;

// Re-export types
export * from './types';
