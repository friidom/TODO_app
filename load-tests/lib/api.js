import http from "k6/http";
import { check, fail } from "k6";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
const API = `${BASE_URL}/api/v1`;
const REFRESH_COOKIE = "refresh";

export function requireEnv(name) {
  const value = __ENV[name];

  if (!value) fail(`${name} is not set`);

  return value;
}

export function login(identifier, password) {
  const res = http.post(`${API}/auth/login`, JSON.stringify({ identifier, password }), {
    headers: { "Content-Type": "application/json" },
    tags: { name: "POST /auth/login", endpoint: "login" },
  });

  if (res.status !== 200) fail(`login failed with ${res.status}: ${res.body}`);

  const { accessToken } = res.json();

  if (!accessToken) fail("login returned no access token; is the account's email verified?");

  const refresh = res.cookies[REFRESH_COOKIE];

  return { accessToken, refreshToken: refresh && refresh.length > 0 ? refresh[0].value : null };
}

export function logout(refreshToken) {
  if (!refreshToken) return;

  http.post(`${API}/auth/logout`, null, {
    cookies: { [REFRESH_COOKIE]: { value: refreshToken, replace: true } },
    tags: { name: "POST /auth/logout", endpoint: "logout" },
  });
}

export function get(route, { endpoint, token, boardId }) {
  const res = http.get(`${API}${route.replace(":boardId", boardId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: `GET ${route}`, endpoint },
  });

  check(res, { [`${endpoint} is 200`]: (r) => r.status === 200 });

  return res;
}
