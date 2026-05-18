"use client";

import { apiFetch } from "./api";

const ACCESS_TOKEN_KEY = "foreman_access_token";
const REFRESH_TOKEN_KEY = "foreman_refresh_token";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const data = await apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function register(name: string, email: string, password: string): Promise<TokenResponse> {
  const data = await apiFetch<TokenResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function fetchCurrentUser(): Promise<User> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated");
  return apiFetch<User>("/auth/me", { token });
}

export function logout(): void {
  clearTokens();
}
