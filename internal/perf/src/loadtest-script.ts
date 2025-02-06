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

  const res = http.post(url, { query });

  check(res, {
    'status is 200': (res) => res.status === 200,
    'body contains data': (res) => !!res.body?.toString().includes('"data":{'),
  });
}
