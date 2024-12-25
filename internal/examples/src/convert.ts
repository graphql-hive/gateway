import fs from 'node:fs/promises';
import path from 'node:path';
import { Proc, spawn, waitForPort } from '@internal/proc';
import { glob } from 'glob';
import j from 'jscodeshift';
import { defer, exists, loc } from './utils';

export interface ConvertE2EToExampleConfig {
  /** The name of the E2E test to convert to an example. */
  e2e: string;
  /**
   * Whether to clean the example directory before converting.
   * @default false
   */
  clean?: boolean;
}

export async function convertE2EToExample(config: ConvertE2EToExampleConfig) {
  if (!config.e2e) {
    throw new Error('E2E test name not provided');
  }

  const e2eDir = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'e2e',
    config.e2e,
  );
  if (!(await exists(e2eDir))) {
    throw new Error(`E2E test at "${e2eDir}" does not exist`);
  }

  const exampleDir = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'examples',
    config.e2e,
  );

  console.log(`Converting E2E test "${e2eDir}" to an example "${exampleDir}"`);

  if (config.clean) {
    console.warn('Cleaning example...');
    try {
      await fs.rm(exampleDir, { recursive: true });
    } catch {
      // noop
    }
  }

  await fs.mkdir(exampleDir, { recursive: true });

  let portForService: PortForService = {};

  const meshConfigTsFile = path.join(e2eDir, 'mesh.config.ts');
  const meshConfigTsFileExists = await exists(meshConfigTsFile);
  if (meshConfigTsFileExists) {
    console.group(`"mesh.config.ts" found, transforming...`);
    using _ = defer(() => console.groupEnd());

    const result = transformMeshConfig(
      await fs.readFile(meshConfigTsFile, 'utf8'),
    );
    portForService = result.portForService;
    const dest = path.join(exampleDir, 'mesh.config.ts');
    console.log(`Writing "${dest}"`);
    await fs.writeFile(dest, result.source);
  }

  const relativeServiceFiles = [];
  for (const serviceFile of await glob(path.join(e2eDir, 'services/**/*.ts'))) {
    const relativeServiceFile = path.relative(e2eDir, serviceFile);
    relativeServiceFiles.push(relativeServiceFile);
    console.group(
      `service file "${relativeServiceFile}" found, transforming...`,
    );
    using _ = defer(() => console.groupEnd());

    const result = transformService(
      await fs.readFile(serviceFile, 'utf8'),
      portForService,
    );

    const dest = path.join(exampleDir, relativeServiceFile);
    console.log(`Writing "${dest}"`);

    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, result.source);
  }

  {
    console.group('Transforming package.json...');
    using _ = defer(() => console.groupEnd());

    const packageJson = JSON.parse(
      await fs.readFile(path.join(e2eDir, 'package.json'), 'utf8'),
    );

    const name = `@example/${path.basename(exampleDir)}`;
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

    // start all services
    let start = 'conc --kill-others-on-fail';
    for (const relativeServiceFile of relativeServiceFiles) {
      start += ` 'tsx ${relativeServiceFile}'`;
    }

    start += " '";
    if (relativeServiceFiles.length) {
      // allow some time for the services to start, if any
      start += 'sleep 1 && ';
    }
    if (meshConfigTsFileExists) {
      // compose if something to compose
      start += 'mesh-compose -o supergraph.graphql && ';
    }
    // start gateway (after composition)
    start += 'hive-gateway supergraph';
    start += "'";
    console.log(`Setting start script "${start}"`);
    packageJson.scripts = { start };

    const dest = path.join(exampleDir, 'package.json');
    console.log(`Writing "${dest}"`);
    await fs.writeFile(dest, JSON.stringify(packageJson, null, '  '));
  }

  console.log(`Installing deps in "${exampleDir}" with "npm i"`);
  let waitForExit: Promise<void>;
  [, waitForExit] = await spawn(
    { cwd: exampleDir, pipeLogs: true },
    'npm',
    'i',
  );
  await waitForExit;

  console.log('Trying start script');
  let proc: Proc;
  const signal = AbortSignal.timeout(5_000);
  [proc, waitForExit] = await spawn(
    { cwd: exampleDir, pipeLogs: true, signal },
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
