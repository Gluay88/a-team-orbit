const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    keepalive: method !== "GET",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

export const api = {
  configured: Boolean(BASE),
  getAll: () => request("GET", "/data"),
  put: (collection, id, body) => request("PUT", `/${collection}/${id}`, body),
  remove: (collection, id) => request("DELETE", `/${collection}/${id}`),
};
