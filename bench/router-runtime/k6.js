import { check } from 'k6';
import http from 'k6/http';

const query = open(__ENV.OPERATION);
const body = JSON.stringify({ query });

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '30s',
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(99)', 'max'],
};

export default function () {
  const res = http.post(__ENV.URL, body, {
    headers: { 'content-type': 'application/json' },
  });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'no errors': (r) => r.json('errors') == null && r.json('data') != null,
  });
}
