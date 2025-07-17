import { Opts, strToBool } from '@internal/testing';
import z from 'zod';
import { convertE2EToExample, PublishedPackages } from './convert';

const opts = Opts(process.argv);

let publishedPackages: PublishedPackages | undefined;
const publishedPackagesOpt = opts.get('publishedPackages');
if (publishedPackagesOpt) {
  try {
    publishedPackages = z
      .array(
        z.object({
          name: z.string(),
          version: z.string(),
        }),
      )
      .parse(JSON.parse(publishedPackagesOpt));
  } catch (err) {
    throw new Error('Problem while parsing "publishedPackages" option', {
      cause: err,
    });
  }
}

await convertE2EToExample({
  e2e: opts.get('e2e', true),
  clean: strToBool(opts.get('clean')),
  skipTest: strToBool(opts.get('skipTest')),
  publishedPackages,
});
