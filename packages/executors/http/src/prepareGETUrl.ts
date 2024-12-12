import { SerializedRequest } from './utils.js';

export function prepareGETUrl({
  baseUrl = '',
  body,
}: {
  baseUrl: string;
  body: SerializedRequest;
}) {
  const dummyHostname = 'https://dummyhostname.com';
  const validUrl = baseUrl.startsWith('http')
    ? baseUrl
    : baseUrl?.startsWith('/')
      ? `${dummyHostname}${baseUrl}`
      : `${dummyHostname}/${baseUrl}`;
  const urlObj = new URL(validUrl);
  if (body.query) {
    urlObj.searchParams.set('query', body.query);
  }
  if (body.variables && Object.keys(body.variables).length > 0) {
    urlObj.searchParams.set('variables', JSON.stringify(body.variables));
  }
  if (body.operationName) {
    urlObj.searchParams.set('operationName', body.operationName);
  }
  if (body.extensions) {
    urlObj.searchParams.set('extensions', JSON.stringify(body.extensions));
  }
  const finalUrl = urlObj.toString().replace(dummyHostname, '');
  return finalUrl;
}
