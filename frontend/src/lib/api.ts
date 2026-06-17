const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sentellent_token");
}

export function setToken(token: string) {
  localStorage.setItem("sentellent_token", token);
}

export function clearToken() {
  localStorage.removeItem("sentellent_token");
}

export function getStoredUser(): any {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("sentellent_user");
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user: any) {
  localStorage.setItem("sentellent_user", JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem("sentellent_user");
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function loginWithGoogle(credential: string) {
  const data = await apiFetch("/api/v1/auth/google", {
    method: "POST",
    body: JSON.stringify({ token: credential }),
  });
  setToken(data.access_token);
  setStoredUser(data.user);
  return data;
}

export async function sendChatMessage(
  message: string,
  conversationId?: string
): Promise<{ reply: string; conversation_id: string }> {
  return apiFetch("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });
}
