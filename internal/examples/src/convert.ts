import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, waitForPort } from '@internal/proc';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { glob } from 'glob';
import j from 'jscodeshift';
import { defer, exists, loc, writeFileMkdir } from './utils';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

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

  const e2eDir = path.resolve(__dirname, '..', '..', '..', 'e2e', config.e2e);
  if (!(await exists(e2eDir))) {
    throw new Error(`E2E test at "${e2eDir}" does not exist`);
  }

  const exampleDir = path.resolve(
    __dirname,
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
  const composes = await exists(meshConfigTsFile);
  if (composes) {
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

  const services: { [name: string]: string /* relative file */ } = {};
  for (const serviceFile of await glob(path.join(e2eDir, 'services/**/*.ts'))) {
    const relativeServiceFile = path.relative(e2eDir, serviceFile);
    services[path.basename(serviceFile, path.extname(serviceFile))] =
      relativeServiceFile;

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

    await writeFileMkdir(dest, result.source);
  }

  {
    console.group('Transforming package.json...');
    using _0 = defer(() => console.groupEnd());

    const packageJson = JSON.parse(
      await fs.readFile(path.join(e2eDir, 'package.json'), 'utf8'),
    );

    const name = `@example/${path.basename(exampleDir)}`;
    packageJson.name = name;
    console.log(`Set name to "${name}"`);

    const gatewayVersion = JSON.parse(
      await fs.readFile(
        path.resolve(
          __dirname,
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
      `Adding "@graphql-hive/gateway@^${gatewayVersion}" as dependency...`,
    );
    packageJson.dependencies['@graphql-hive/gateway'] = `^${gatewayVersion}`;

    if (Object.keys(services).length) {
      const version = '^4.19.2';
      console.log(
        `Adding "tsx@${version}" dev dependency because there are services...`,
      );
      packageJson.devDependencies ||= {};
      packageJson.devDependencies['tsx'] = version; // TODO: use the version from root package.json
    }

    {
      console.group('Adding scripts...');
      using _1 = defer(() => console.groupEnd());

      const scripts: Record<string, string> = {};
      for (const [name, relativeFile] of Object.entries(services)) {
        // will be used in tasks.json
        scripts[`service:${name}`] = `tsx ${relativeFile}`;
      }
      if (composes) {
        scripts['compose'] = 'mesh-compose -o supergraph.graphql';
      }
      scripts['gateway'] = 'hive-gateway supergraph';

      console.log(JSON.stringify(scripts, null, '  '));
      packageJson.scripts = scripts;
    }

    const dest = path.join(exampleDir, 'package.json');
    console.log(`Writing "${dest}"`);
    await fs.writeFile(dest, JSON.stringify(packageJson, null, '  '));
  }

  {
    console.group('Adding devcontainer...');
    using _ = defer(() => console.groupEnd());

    const dest = path.join(exampleDir, '.devcontainer', 'devcontainer.json');
    console.log(`Writing "${dest}"`);
    await writeFileMkdir(
      dest,
      JSON.stringify(
        {
          name: 'Node.js',
          image: 'mcr.microsoft.com/devcontainers/javascript-node:20',
        },
        null,
        '  ',
      ),
    );
  }

  const setupTasks: { name: string; command: string }[] = [];
  {
    console.group('Defining codesandbox setup and tasks...');
    using _ = defer(() => console.groupEnd());

    setupTasks.push({
      name: 'Install',
      command: 'npm i',
    });

    for (const service of Object.keys(services)) {
      setupTasks.push({
        name: `Start service ${service}`,
        command: `npm run service:${service} &`,
      });
      setupTasks.push({
        name: `Wait for service ${service}`,
        command: `curl --retry-connrefused --retry 10 --retry-delay 3 http://localhost:${portForService[service]}`,
      });
    }

    if (composes) {
      setupTasks.push({
        name: 'Compose',
        command: 'npm run compose',
      });
    }

    const tasks = {
      gateway: {
        name: 'Hive Gateway',
        runAtStart: true,
        command: 'npm run gateway',
        preview: {
          port: 4000,
        },
      },
    };
    console.log(JSON.stringify({ setupTasks, tasks }, null, '  '));

    const dest = path.join(exampleDir, '.codesandbox', 'tasks.json');
    console.log(`Writing "${dest}"`);
    await writeFileMkdir(
      dest,
      JSON.stringify({ setupTasks, tasks }, null, '  '),
    );
  }

  {
    console.group('Testing codesandbox setup and starting Hive Gateway...');
    using _ = defer(() => console.groupEnd());

    await using stack = new AsyncDisposableStack();

    for (const task of setupTasks) {
      console.log(`Running "${task.name}"...`);
      const [cmd, ...args] = task.command.split(' ');
      if (!cmd) {
        throw new Error(`Task "${task.name}" does not have a command`);
      }
      const isBackgroundJob = args[args.length - 1] === '&';
      const [proc, waitForExit] = await spawn(
        {
          cwd: exampleDir,
          signal: isBackgroundJob ? AbortSignal.timeout(10_000) : undefined,
        },
        cmd,
        ...args,
      );
      if (isBackgroundJob) {
        console.info('Task is a background job, not waiting for exit');
        stack.use(proc);
      } else {
        await waitForExit;
      }
    }

    console.log(`Starting Hive Gateway...`);
    const [proc, waitForExit] = await spawn(
      { cwd: exampleDir, signal: AbortSignal.timeout(10_000) },
      'npm',
      'run',
      'gateway',
    );
    stack.use(proc);
    await Promise.race([
      waitForExit,
      waitForPort(4000, AbortSignal.timeout(10_000)),
    ]);
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
