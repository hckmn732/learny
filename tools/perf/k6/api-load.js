/* global __ENV, __VU, open */
// Test de charge de l'API (SPEC-804 EF-4, ADR-0202) : 50 utilisateurs virtuels, 3 minutes,
// 10 routes sans IA, p95 < 300 ms au global et par route, < 1 % d'échecs, aucun 429.
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

const DISTRIBUTION = [
  { name: 'home', weight: 20, method: 'GET', path: '/api/v1/home' },
  { name: 'unread_count', weight: 15, method: 'GET', path: '/api/v1/notifications/unread-count' },
  {
    name: 'agenda',
    weight: 15,
    method: 'GET',
    path: '/api/v1/agenda?from=2026-11-09&to=2026-11-15&formation=all',
  },
  { name: 'notifications', weight: 10, method: 'GET', path: '/api/v1/notifications?filter=all' },
  {
    name: 'programme',
    weight: 10,
    method: 'GET',
    path: '/api/v1/formations/{formationId}/programme',
  },
  {
    name: 'global_quiz_today',
    weight: 10,
    method: 'GET',
    path: '/api/v1/formations/{formationId}/global-quiz/today?mode=full',
  },
  { name: 'gaps', weight: 5, method: 'GET', path: '/api/v1/formations/{formationId}/gaps' },
  {
    name: 'notion_graph',
    weight: 5,
    method: 'GET',
    path: '/api/v1/formations/{formationId}/notion-graph',
  },
  { name: 'search', weight: 5, method: 'GET', path: '/api/v1/search?q=piece' },
  {
    name: 'notifications_read_all',
    weight: 5,
    method: 'POST',
    path: '/api/v1/notifications/read-all',
  },
];

const trendNames = DISTRIBUTION.map((route) => `route_${route.name}_duration`);
const routeTrends = Object.fromEntries(
  DISTRIBUTION.map((route) => [route.name, new Trend(`route_${route.name}_duration`)]),
);
const rate429 = new Counter('status_429');

const thresholds = {
  http_req_duration: ['p(95)<300'],
  http_req_failed: ['rate<0.01'],
  status_429: ['count==0'],
};
for (const name of trendNames) thresholds[name] = ['p(95)<300'];

export const options = {
  thresholds,
  scenarios: {
    api: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
};

const BASE_URL = __ENV.BASE_URL ?? 'http://127.0.0.1:3100';
const FORMATION_ID = __ENV.FORMATION_ID ?? '';
const COOKIE = __ENV.PERF_COOKIE ?? '';
// Un utilisateur `perf-NN` par VU : les 50 seaux de limitation de débit restent indépendants.
const COOKIES_FILE = __ENV.PERF_COOKIES_FILE ?? '';
const SESSIONS = COOKIES_FILE === '' ? [] : JSON.parse(open(COOKIES_FILE));

function pickRoute() {
  const total = DISTRIBUTION.reduce((sum, route) => sum + route.weight, 0);
  let ticket = Math.random() * total;
  for (const route of DISTRIBUTION) {
    ticket -= route.weight;
    if (ticket <= 0) return route;
  }
  return DISTRIBUTION[0];
}

export default function apiLoad() {
  const route = pickRoute();
  const session = SESSIONS.length === 0 ? null : SESSIONS[(__VU - 1) % SESSIONS.length];
  const url = `${BASE_URL}${route.path.replace(
    '{formationId}',
    session === null ? FORMATION_ID : session.formationId,
  )}`;
  const cookie = session === null ? COOKIE : session.cookie;
  const headers = {
    Cookie: cookie,
    Origin: BASE_URL,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const response =
    route.method === 'POST'
      ? http.post(url, '{}', { headers, tags: { name: route.name } })
      : http.get(url, { headers, tags: { name: route.name } });
  routeTrends[route.name].add(response.timings.duration);
  if (response.status === 429) rate429.add(1);
  check(response, {
    'statut attendu': (r) => r.status >= 200 && r.status < 400,
  });
  sleep(1);
}
