/** Configurable standalone IPTV service; empty means same-origin /api (Emergent/dev). */
const configuredOrigin = (import.meta.env.VITE_API_ORIGIN || "").trim().replace(/\/+$/, "");

export const API_ORIGIN = configuredOrigin;
export const API_BASE = `${API_ORIGIN}/api`;
