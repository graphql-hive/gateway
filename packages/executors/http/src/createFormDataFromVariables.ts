import { SerializedExecutionRequest } from '@graphql-tools/executor-common';
import { isAsyncIterable } from '@graphql-tools/utils';
import {
  File as DefaultFile,
  FormData as DefaultFormData,
} from '@whatwg-node/fetch';
import {
  handleMaybePromise,
  isPromise,
  MaybePromise,
} from '@whatwg-node/promise-helpers';
import { extractFiles, isExtractableFile } from 'extract-files';
import { isGraphQLUpload } from './isGraphQLUpload.js';

function collectAsyncIterableValues<T>(
  asyncIterable: AsyncIterable<T>,
): MaybePromise<T[]> {
  const values: T[] = [];
  const iterator = asyncIterable[Symbol.asyncIterator]();
  function iterate(): MaybePromise<T[]> {
    return handleMaybePromise(
      () => iterator.next(),
      ({ value, done }) => {
        if (value != null) {
          values.push(value);
        }
        if (done) {
          return values;
        }
        return iterate();
      },
    );
  }
  return iterate();
}

export function createFormDataFromVariables(
  body: SerializedExecutionRequest,
  {
    File: FileCtor = DefaultFile,
    FormData: FormDataCtor = DefaultFormData,
  }: {
    File?: typeof File;
    FormData?: typeof DefaultFormData;
  },
) {
  if (!body.variables) {
    return JSON.stringify(body);
  }
  const vars = Object.assign({}, body.variables);
  const { clone, files } = extractFiles(
    vars,
    'variables',
    ((v: any) =>
      isExtractableFile(v) ||
      v?.promise ||
      isAsyncIterable(v) ||
      v?.then ||
      typeof v?.arrayBuffer === 'function') as any,
  );
  if (files.size === 0) {
    return JSON.stringify(body);
  }
  const map: Record<number, string[]> = {};
  const uploads: any[] = [];
  let currIndex = 0;
  for (const [file, curr] of files) {
    map[currIndex] = curr;
    uploads[currIndex] = file;
    currIndex++;
  }
  const form = new FormDataCtor();
  form.append(
    'operations',
    JSON.stringify({
      ...body,
      variables: clone,
    }),
  );
  form.append('map', JSON.stringify(map));
  function handleUpload(upload: any, i: number): void | PromiseLike<void> {
    const indexStr = i.toString();
    if (upload != null) {
      return handleMaybePromise(
        () => upload?.promise || upload,
        (upload): MaybePromise<void> => {
          const filename =
            upload.filename || upload.name || upload.path || `blob-${indexStr}`;
          if (isBlob(upload)) {
            form.append(indexStr, upload, filename);
          } else if (isAsyncIterable(upload)) {
            return handleMaybePromise(
              () => collectAsyncIterableValues<any>(upload),
              (chunks) => {
                const blobPart = new Uint8Array(chunks);
                form.append(
                  indexStr,
                  new FileCtor([blobPart], filename),
                  filename,
                );
              },
            );
          } else if (isGraphQLUpload(upload)) {
            return handleMaybePromise(
              () => collectAsyncIterableValues(upload.createReadStream()),
              (chunks) => {
                const blobPart = new Uint8Array(chunks);
                form.append(
                  indexStr,
                  new FileCtor([blobPart], filename, { type: upload.mimetype }),
                  filename,
                );
              },
            );
          } else {
            form.append(indexStr, new FileCtor([upload], filename), filename);
          }
        },
      );
    }
  }
  const jobs: PromiseLike<void>[] = [];
  for (const i in uploads) {
    const upload = uploads[i];
    const job = handleUpload(upload, Number(i));
    if (isPromise(job)) {
      jobs.push(job);
    }
  }
  if (jobs.length > 0) {
    return Promise.all(jobs).then(() => form);
  }
  return form;
}

function isBlob(obj: any): obj is Blob {
  return typeof obj.arrayBuffer === 'function';
}
