const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const ACCESS_TOKEN_KEY = "foreman_access_token";
const REFRESH_TOKEN_KEY = "foreman_refresh_token";

interface FetchOptions extends RequestInit {
  token?: string;
  _isRetry?: boolean;
}

// Promise lock so concurrent 401s only fire one refresh request.
let refreshPromise: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const refresh =
    typeof window !== "undefined"
      ? localStorage.getItem(REFRESH_TOKEN_KEY)
      : null;
  if (!refresh) throw new Error("No refresh token");

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Refresh failed ${res.status}`);
  }
  const data = await res.json();
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  return data.access_token as string;
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { token, headers: extraHeaders, _isRetry, ...rest } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((extraHeaders as Record<string, string>) ?? {}),
  };

  // Prefer explicit token, then fall back to localStorage.
  const accessToken =
    token ??
    (typeof window !== "undefined" ? localStorage.getItem(ACCESS_TOKEN_KEY) : null);
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { headers, ...rest });

  // 204 No Content — nothing to parse.
  if (res.status === 204) {
    return null as unknown as T;
  }

  // 401 Unauthorized — attempt one token refresh then retry.
  if (res.status === 401 && !_isRetry) {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    return apiFetch<T>(path, { ...opts, token: newToken, _isRetry: true });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}
