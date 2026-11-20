export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body instanceof FormData
      ? init.headers
      : { "Content-Type": "application/json", ...init?.headers },
    credentials: "same-origin",
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json() as { error?: string } & T;
  if (!response.ok) throw new ApiError(result.error ?? "The request could not be completed.", response.status);
  return result;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) => request<T>(path, {
    method: "POST",
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
  }),
  patch: <T,>(path: string, body: unknown) => request<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  }),
};

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "technician" | "donor" | "recipient";
  area: string;
}

export interface Catalog {
  models: Array<{ id: string; brand: string; modelName: string }>;
  parts: Array<{ id: string; partName: string }>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
