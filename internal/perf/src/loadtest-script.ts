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

  if (res.status !== 200) {
    return test.abort(
      `Status is not 200, got status ${res.status} and body:\n${res.body?.toString()}`,
    );
  }
  if (!res.body?.toString().includes('"data":{')) {
    return test.abort(`Body does not contain "data":\n${res.body?.toString()}`);
  }

  // all loadtest request must succeed. or do they? if they dont,
  // how do we make sure the memory footprint is accurate?
  //
  // import { check } from 'k6';
  // check(res, {
  //   'status is 200': (res) => res.status === 200,
  //   'body contains data': (res) => !!res.body?.toString().includes('"data":{'),
  // });
}
