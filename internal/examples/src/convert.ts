import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import j from 'jscodeshift';
import z from 'zod';
import { exists } from './utils';

export type ConvertE2EToExampleConfig = z.infer<
  typeof convertE2EToExampleConfigSchema
>;

export const convertE2EToExampleConfigSchema = z.object({
  e2eDir: z
    .string()
    .refine(exists, 'Directory does not exist')
    .transform((arg) => path.resolve(arg))
    .refine(
      (arg) =>
        glob(path.join(arg, '*.e2e.ts')).then((paths) => paths.length > 0),
      'Directory does not contain an E2E test (no "*.e2e.ts" file)',
    ),
});

export async function convertE2EToExample(config: ConvertE2EToExampleConfig) {
  console.log(`Converting E2E test at "${config.e2eDir}" to an example`);

  const meshConfigTsFile = path.join(config.e2eDir, 'mesh.config.ts');
  if (await exists(meshConfigTsFile)) {
    console.log(`"mesh.config.ts" found, converting...`);

    const root = j(await fs.readFile(meshConfigTsFile, 'utf8'));

    root
      // import '@internal/testing'
      .find(j.ImportDeclaration, {
        source: {
          value: '@internal/testing',
        },
      })
      .forEach((p) => {
        p.node.specifiers
          // import { Opts } from '@internal/testing'
          ?.filter((s) => 'imported' in s && s.imported.name === 'Opts')
          .forEach((s) => {
            root
              // const opts = Opts()
              .find(j.VariableDeclarator, {
                init: {
                  callee: {
                    name: s.local!.name,
                  },
                },
              })
              .forEach((p) => {
                if (p.node.id.type !== 'Identifier') return;

                const startingServicePort = 4001;
                const servicePort: { [service: string]: number /* port */ } =
                  {};

                root
                  // opts.getServicePort()
                  .find(j.CallExpression, {
                    callee: {
                      object: {
                        name: p.node.id.name,
                      },
                      property: {
                        name: 'getServicePort',
                      },
                    },
                  })
                  .forEach((p, i) => {
                    const arg0 = p.node.arguments[0];
                    if (arg0?.type !== 'Literal') {
                      throw new Error(
                        'TODO: get variable value when literal is not used in "opts.getServicePort" argument',
                      );
                    }

                    const port = startingServicePort + i;
                    servicePort[arg0.value!.toString()] = port;

                    j(p).replaceWith(j.literal(port)); // replace opts.servicePort('foo') with port literal
                  });
              })
              .remove(); // remove all const opts = Opts()
          });
      })
      .remove(); // remove all import '@internal/testing'

    console.log(root.toSource());
  }
}
