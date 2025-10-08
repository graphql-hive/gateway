import { check } from 'k6';
import { test } from 'k6/execution';
import http from 'k6/http';

export default function () {
  const url = __ENV['URL'];
  if (!url) {
    return test.abort('Environment variable "URL" not provided');
  }

  const res = http.get(url);

  if (__ENV['ALLOW_FAILING_REQUESTS']) {
    check(res, {
      'status is 200': (res) => res.status === 200,
    });
  } else {
    const body = res.body?.toString() || '';
    if (res.status !== 200) {
      return test.abort(
        `Status is not 200, got status ${res.status} and body:\n${body}`,
      );
    }
  }
}
