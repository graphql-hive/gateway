import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import j from 'jscodeshift';
import z from 'zod';
import { defer, exists, loc } from './utils';

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

  let portForService: PortForService = {};

  const meshConfigTsFile = path.join(config.e2eDir, 'mesh.config.ts');
  if (await exists(meshConfigTsFile)) {
    console.group(`"mesh.config.ts" found, transforming...`);
    using _ = defer(() => console.groupEnd());

    const result = transformMeshConfig(
      await fs.readFile(meshConfigTsFile, 'utf8'),
    );
    portForService = result.portForService;
    // TODO: write result.source
  }

  for (const serviceFile of await glob(
    path.join(config.e2eDir, 'services/**/*.ts'),
  )) {
    console.group(
      `service file "${path.relative(config.e2eDir, serviceFile)}" found, transforming...`,
    );
    using _ = defer(() => console.groupEnd());

    transformService(await fs.readFile(serviceFile, 'utf8'), portForService);
  }
}

interface PortForService {
  [service: string]: number /* port */;
}

/**
 * @param source - Source code of the `mesh.config.ts` file.
 */
function transformMeshConfig(source: string) {
  const root = j(source);

  const startingServicePort = 4001;
  const portForService: PortForService = {};

  root
    // import '@internal/testing'
    .find(j.ImportDeclaration, {
      source: {
        value: '@internal/testing',
      },
    })
    .forEach((path) => {
      console.group(
        `Processing "@internal/testing" import at ${loc(path)}, will remove`,
      );
      using _ = defer(() => console.groupEnd());

      path.node.specifiers
        // import { Opts } from '@internal/testing'
        ?.filter((s) => 'imported' in s && s.imported.name === 'Opts')
        .forEach((s, i) => {
          console.group(
            `Processing imported "Opts" #${i + 1} (as "${s.local!.name}")`,
          );
          using _ = defer(() => console.groupEnd());

          root
            // const opts = Opts()
            .find(j.VariableDeclarator, {
              init: {
                callee: {
                  name: s.local!.name,
                },
              },
            })
            .forEach((path) => {
              if (path.node.id.type !== 'Identifier') {
                throw new Error(
                  `Expected "Opts()" to declare a node of type "Identifier", but got "${path.node.id.type}"`,
                );
              }

              const variableName = path.node.id.name;
              console.group(
                `Variable "${variableName}" declared with "Opts()" at ${loc(path)}`,
              );
              using _ = defer(() => console.groupEnd());

              root
                // opts.getServicePort()
                .find(j.CallExpression, {
                  callee: {
                    object: {
                      name: variableName,
                    },
                    property: {
                      name: 'getServicePort',
                    },
                  },
                })
                .forEach((path, i) => {
                  const arg0 = path.node.arguments[0];
                  if (arg0?.type !== 'Literal') {
                    throw new Error(
                      'TODO: get variable value when literal is not used in "opts.getServicePort" argument',
                    );
                  }

                  const serviceName = arg0.value!.toString();
                  const port = startingServicePort + i;
                  portForService[serviceName] = port;

                  console.log(
                    `Replacing "${variableName}.getServicePort('${serviceName}')" with "${port}" at ${loc(path, true)}`,
                  );

                  j(path).replaceWith(j.literal(port)); // replace opts.portForService('foo') with port literal
                });
            })
            .remove(); // remove all const opts = Opts()
        });
    })
    .remove(); // remove all import '@internal/testing'

  return { source: root.toSource(), portForService };
}

/**
 * @param source - Source code of the `mesh.config.ts` file.
 * @param portForService - Map of service names to ports.
 */
function transformService(source: string, portForService: PortForService) {
  const root = j(source);

  root
    // import '@internal/testing'
    .find(j.ImportDeclaration, {
      source: {
        value: '@internal/testing',
      },
    })
    .forEach((path) => {
      console.group(
        `Processing "@internal/testing" import at ${loc(path)}, will remove`,
      );
      using _ = defer(() => console.groupEnd());

      path.node.specifiers
        // import { Opts } from '@internal/testing'
        ?.filter((s) => 'imported' in s && s.imported.name === 'Opts')
        .forEach((s, i) => {
          console.group(
            `Processing imported "Opts" #${i + 1} (as "${s.local!.name}")`,
          );
          using _ = defer(() => console.groupEnd());

          root
            // const opts = Opts()
            .find(j.VariableDeclarator, {
              init: {
                callee: {
                  name: s.local!.name,
                },
              },
            })
            .forEach((path) => {
              if (path.node.id.type !== 'Identifier') {
                throw new Error(
                  `Expected "Opts()" to declare a node of type "Identifier", but got "${path.node.id.type}"`,
                );
              }

              const variableName = path.node.id.name;
              console.group(
                `Variable "${variableName}" declared with "Opts()" at ${loc(path)}`,
              );
              using _ = defer(() => console.groupEnd());

              root
                // opts.getServicePort()
                .find(j.CallExpression, {
                  callee: {
                    object: {
                      name: variableName,
                    },
                    property: {
                      name: 'getServicePort',
                    },
                  },
                })
                .forEach((path, i) => {
                  const arg0 = path.node.arguments[0];
                  if (arg0?.type !== 'Literal') {
                    throw new Error(
                      'TODO: get variable value when literal is not used in "opts.getServicePort" argument',
                    );
                  }

                  const serviceName = arg0.value!.toString();
                  const port = portForService[serviceName];
                  if (!port) {
                    throw new Error(
                      `Port for service "${serviceName}" not found`,
                    );
                  }

                  console.log(
                    `Replacing "${variableName}.getServicePort('${serviceName}')" with "${port}" at ${loc(path, true)}`,
                  );

                  j(path).replaceWith(j.literal(port)); // replace opts.portForService('foo') with port literal
                });
            })
            .remove(); // remove all const opts = Opts()
        });
    })
    .remove(); // remove all import '@internal/testing'

  return { source: root.toSource() };
}
