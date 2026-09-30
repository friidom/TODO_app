import { fail, sleep } from "k6";

import { get, login, logout, requireEnv } from "./lib/api.js";

const BOARD_PAGE = {
  auth_me: "/auth/me",
  boards: "/boards",
  board: "/boards/:boardId",
  workflow: "/boards/:boardId/workflow",
  todos: "/boards/:boardId/todos",
  members: "/boards/:boardId/members",
  sprints: "/boards/:boardId/sprints",
  activities: "/boards/:boardId/activities?limit=50",
  unread_count: "/notifications/unread-count",
};

const LATENCY = ["p(95)<500", "p(99)<1000"];

export const options = {
  // The access token from setup() is never refreshed, so the whole run must
  // finish inside the backend's ACCESS_TOKEN_TTL (15m by default).
  stages: [
  { duration: "15s", target: 50 },
  { duration: "15s", target: 100 },
  { duration: "20s", target: 200 },
  { duration: "30s", target: 300 },
  { duration: "30s", target: 400 },
  { duration: "30s", target: 500 },
  { duration: "30s", target: 1000 },
  { duration: "30s", target: 2000 },
  { duration: "15s", target: 0 },
],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: LATENCY,
    checks: ["rate>0.99"],
    ...Object.fromEntries(
      Object.keys(BOARD_PAGE).map((endpoint) => [`http_req_duration{endpoint:${endpoint}}`, LATENCY]),
    ),
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

function listBoardIds(token) {
  const res = get(BOARD_PAGE.boards, { endpoint: "setup_boards", token });

  if (res.status !== 200) fail(`GET /boards failed with ${res.status}: ${res.body}`);

  return res.json().map((board) => board.id);
}

// One login shared by every VU: /auth/login allows 40 attempts per 15 minutes
// per IP, and its argon2 hash would otherwise dominate the numbers.
export function setup() {
  const { accessToken, refreshToken } = login(
    requireEnv("LOAD_TEST_IDENTIFIER"),
    requireEnv("LOAD_TEST_PASSWORD"),
  );

  const boardIds = __ENV.BOARD_IDS
    ? __ENV.BOARD_IDS.split(",").map((id) => id.trim()).filter(Boolean)
    : listBoardIds(accessToken);

  if (boardIds.length === 0) fail("the load-test account can see no boards");

  return { token: accessToken, refreshToken, boardIds };
}

export default function ({ token, boardIds }) {
  // Round-robin rather than random, so every run spreads the same load over
  // the same boards and results stay comparable between runs.
  const boardId = boardIds[(__VU + __ITER) % boardIds.length];

  for (const [endpoint, route] of Object.entries(BOARD_PAGE)) {
    get(route, { endpoint, token, boardId });
  }

  sleep(1);
}

export function teardown({ refreshToken }) {
  logout(refreshToken);
}
