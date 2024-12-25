import fs from 'node:fs/promises';
import path from 'node:path';
import { Proc, spawn, waitForPort } from '@internal/proc';
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
  dest: z.string().transform((arg) => path.resolve(arg)),
  clean: z.boolean().optional(),
});

export async function convertE2EToExample(config: ConvertE2EToExampleConfig) {
  console.log(
    `Converting E2E test "${config.e2eDir}" to an example "${config.dest}"`,
  );

  if (config.clean) {
    console.warn('Cleaning example...');
    try {
      await fs.rm(config.dest, { recursive: true });
    } catch {
      // noop
    }
  }

  await fs.mkdir(config.dest, { recursive: true });

  let portForService: PortForService = {};

  const meshConfigTsFile = path.join(config.e2eDir, 'mesh.config.ts');
  if (await exists(meshConfigTsFile)) {
    console.group(`"mesh.config.ts" found, transforming...`);
    using _ = defer(() => console.groupEnd());

    const result = transformMeshConfig(
      await fs.readFile(meshConfigTsFile, 'utf8'),
    );
    portForService = result.portForService;
    const dist = path.join(config.dest, 'mesh.config.ts');
    console.log(`Writing "${dist}"`);
    await fs.writeFile(dist, result.source);
  }

  const relativeServiceFiles = [];
  for (const serviceFile of await glob(
    path.join(config.e2eDir, 'services/**/*.ts'),
  )) {
    const relativeServiceFile = path.relative(config.e2eDir, serviceFile);
    relativeServiceFiles.push(relativeServiceFile);
    console.group(
      `service file "${relativeServiceFile}" found, transforming...`,
    );
    using _ = defer(() => console.groupEnd());

    const result = transformService(
      await fs.readFile(serviceFile, 'utf8'),
      portForService,
    );

    const dist = path.join(config.dest, relativeServiceFile);
    console.log(`Writing "${dist}"`);

    await fs.mkdir(path.dirname(dist), { recursive: true });
    await fs.writeFile(dist, result.source);
  }

  {
    console.group('Transforming package.json...');
    using _ = defer(() => console.groupEnd());

    const packageJson = JSON.parse(
      await fs.readFile(path.join(config.e2eDir, 'package.json'), 'utf8'),
    );

    const name = `@example/${path.basename(config.dest)}`;
    console.log(`Setting name to "${name}"`);
    packageJson.name = name;

    const gatewayVersion = JSON.parse(
      await fs.readFile(
        path.resolve(
          import.meta.dirname,
          '..',
          '..',
          '..',
          'packages',
          'gateway',
          'package.json',
        ),
        'utf8',
      ),
    ).version;
    console.log(
      `Adding "@graphql-hive/gateway@^${gatewayVersion}" as dependency`,
    );
    packageJson.dependencies['@graphql-hive/gateway'] = `^${gatewayVersion}`;

    console.log(`Adding "tsx" and "concurrency" as dev dependencies`);
    packageJson.devDependencies ||= {};
    packageJson.devDependencies['tsx'] = '^4.19.2';
    packageJson.devDependencies['concurrently'] = '^9.1.0';

    let start = 'conc --kill-others-on-fail';
    for (const relativeServiceFile of relativeServiceFiles) {
      start += ` 'tsx ${relativeServiceFile}'`;
    }
    start += ` 'mesh-compose -o supergraph.graphql'`;
    start += ` 'hive-gateway supergraph'`;
    console.log(`Setting start script "${start}"`);
    packageJson.scripts = { start };

    const dist = path.join(config.dest, 'package.json');
    console.log(`Writing "${dist}"`);
    await fs.writeFile(dist, JSON.stringify(packageJson, null, '  '));
  }

  console.log(`Installing deps in "${config.dest}" with "npm i"`);
  let waitForExit: Promise<void>;
  [, waitForExit] = await spawn(
    { cwd: config.dest, pipeLogs: true },
    'npm',
    'i',
  );
  await waitForExit;

  console.log('Trying start script');
  let proc: Proc;
  const signal = AbortSignal.timeout(5_000);
  [proc, waitForExit] = await spawn(
    { cwd: config.dest, pipeLogs: true, signal },
    'npm',
    'start',
  );
  try {
    await Promise.race([
      waitForExit,
      waitForPort(4000, AbortSignal.timeout(7_000)),
    ]);
  } finally {
    await proc[Symbol.asyncDispose]();
  }
  console.log('Ok');
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
                .forEach((path) => {
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
