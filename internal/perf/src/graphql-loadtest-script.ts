import { check } from 'k6';
import { test } from 'k6/execution';
import http from 'k6/http';

export default function () {
  const url = __ENV['URL'];
  if (!url) {
    return test.abort('Environment variable "URL" not provided');
  }

  const query = __ENV['QUERY'];
  if (!query) {
    return test.abort('Environment variable "QUERY" not provided');
  }

  const res = http.post(
    url,
    { query },
    { headers: { 'content-type': 'application/json' } },
  );

  if (__ENV['ALLOW_FAILING_REQUESTS']) {
    check(res, {
      'status is 200': (res) => res.status === 200,
      'body contains data': (res) =>
        !!res.body?.toString().includes('"data":{'),
    });
  } else {
    const body = res.body?.toString() || '';
    if (res.status !== 200) {
      return test.abort(
        `Status is not 200, got status ${res.status} and body:\n${body}`,
      );
    }
    if (!body.includes('"data":{')) {
      return test.abort(`Body does not contain "data":\n${body}`);
    }
  }
}
