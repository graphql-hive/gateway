import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, waitForPort } from '@internal/proc';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { glob } from 'glob';
import j, { Collection } from 'jscodeshift';
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

  if (config.clean) {
    console.warn('Cleaning example...');
    try {
      await fs.rm(exampleDir, { recursive: true });
    } catch {
      // noop
    }
  }

  console.log(`Converting E2E test "${e2eDir}" to an example "${exampleDir}"`);
  await fs.mkdir(exampleDir, { recursive: true });

  const e2eTestFiles = await glob(path.join(e2eDir, '*.e2e.ts'));
  if (!e2eTestFiles.length) {
    throw new Error('No E2E test files (*.e2e.ts) found');
  }
  if (e2eTestFiles.length > 1) {
    throw new Error('Multiple E2E test files (*.e2e.ts) found');
  }
  let eenv: Eenv;
  {
    const e2eTestFile = e2eTestFiles[0]!;

    console.group(
      `"${path.basename(e2eTestFile)}" found, parsing tenv to eenv (example environment)...`,
    );
    using _ = defer(() => console.groupEnd());

    eenv = parseTenv(await fs.readFile(e2eTestFile, 'utf8'));
    console.log('eenv', JSON.stringify(eenv, null, '  '));
  }

  const meshConfigTsFile = path.join(e2eDir, 'mesh.config.ts');
  const composes = await exists(meshConfigTsFile);
  if (composes) {
    console.group(`"mesh.config.ts" found, transforming service ports...`);
    using _ = defer(() => console.groupEnd());

    const source = transformServicePorts(
      eenv,
      await fs.readFile(meshConfigTsFile, 'utf8'),
    );
    const dest = path.join(exampleDir, 'mesh.config.ts');
    console.log(`Writing "${dest}"`);
    await fs.writeFile(dest, source);
  }

  for (const service of Object.keys(eenv.services)) {
    const loc = await findServiceLocation(e2eDir, service);

    const relativeServiceFiles: string[] = []; // relative paths to service files
    if (loc.type === 'file') {
      relativeServiceFiles.push(loc.relativePath);
    } /** loc.type === 'dir' */ else {
      for (const serviceFile of await glob(path.join(loc.path, '**/*.ts'))) {
        const relativeServiceFile = path.relative(e2eDir, serviceFile);
        relativeServiceFiles.push(relativeServiceFile);
      }
    }

    loc.type === 'dir' &&
      console.group(
        `service dir "${loc.relativePath}" found, transforming files within...`,
      );
    for (const relativeServiceFile of relativeServiceFiles) {
      console.group(
        `service file "${relativeServiceFile}" found, transforming service ports...`,
      );
      using _ = defer(() => console.groupEnd());

      const source = transformServicePorts(
        eenv,
        await fs.readFile(path.join(e2eDir, relativeServiceFile), 'utf8'),
      );

      const dest = path.join(exampleDir, relativeServiceFile);
      console.log(`Writing "${dest}"`);

      await writeFileMkdir(dest, source);
    }
    loc.type === 'dir' && console.groupEnd();
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

    if (Object.keys(eenv.services).length) {
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
      for (const service of Object.keys(eenv.services)) {
        // will be used in tasks.json
        const loc = await findServiceLocation(exampleDir, service);
        scripts[`service:${service}`] = `tsx ${loc.relativePath}`;
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

    for (const [name, opts] of Object.entries(eenv.services)) {
      setupTasks.push({
        name: `Start service ${name}`,
        command: `npm run service:${name} &`,
      });
      setupTasks.push({
        name: `Wait for service ${name}`,
        command: `curl --retry-connrefused --retry 10 --retry-delay 3 http://localhost:${opts.port}`,
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
          signal: isBackgroundJob ? undefined : AbortSignal.timeout(60_000),
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
      { cwd: exampleDir },
      'npm',
      'run',
      'gateway',
    );
    stack.use(proc);
    await Promise.race([
      waitForExit,
      waitForPort({
        port: 4000,
        signal: AbortSignal.timeout(10_000),
      }),
    ]);
  }

  console.log('Ok');
}

/** Parsing an E2E `Tenv` creates and `Eenv` (Example environment). */
export interface Eenv {
  gateway: { port: number };
  services: { [name: string]: { port: number } };
}

/** Parses a source file containing `createTenv` and creates an {@link Eenv} from it. */
export function parseTenv(source: string): Eenv {
  const root = j(source);

  const eenv: Eenv = {
    gateway: { port: 4000 },
    services: {},
  };
  const startingServicePort = eenv.gateway.port + 1;

  root
    // import '@internal/e2e'
    .find(j.ImportDeclaration, {
      source: {
        value: '@internal/e2e',
      },
    })
    .forEach((path) => {
      console.group(`Processing "@internal/e2e" import at ${loc(path)}`);
      using _ = defer(() => console.groupEnd());

      path.node.specifiers
        // import { createExampleSetup } from '@internal/e2e'
        ?.filter(
          (s) => 'imported' in s && s.imported.name === 'createExampleSetup',
        )
        .forEach((createExampleSetupImport) => {
          console.group(
            `Detected "createExampleSetup" import (as "${createExampleSetupImport.local!.name}") at ${loc(createExampleSetupImport, true)}`,
          );
          using _ = defer(() => console.groupEnd());

          root
            .find(j.CallExpression, {
              callee: {
                type: 'Identifier',
                name: createExampleSetupImport.local!.name,
              },
            })
            .forEach((path) => {
              console.group(`createExampleSetup() used at ${loc(path, true)}`);
              using _ = defer(() => console.groupEnd());

              // BEWARE: keep in sync with @internal/e2e example setup
              for (const service of [
                'accounts',
                'inventory',
                'products',
                'reviews',
              ]) {
                const port =
                  startingServicePort + Object.keys(eenv.services).length;
                console.log(`Adding service "${service}" with port "${port}"`);
                eenv.services[service] = { port };
              }
            });
        });

      path.node.specifiers
        // import { createTenv } from '@internal/e2e'
        ?.filter((s) => 'imported' in s && s.imported.name === 'createTenv')
        .forEach((createTenvImport) => {
          console.group(
            `Processing imported "createTenv" (as "${createTenvImport.local!.name}") at ${loc(createTenvImport, true)}`,
          );
          using _ = defer(() => console.groupEnd());

          root
            // const ? = createTenv()
            .find(j.VariableDeclarator, {
              init: {
                type: 'CallExpression',
                callee: {
                  type: 'Identifier',
                  name: createTenvImport.local!.name,
                },
              },
            })
            .forEach((path) => {
              if (path.node.id.type !== 'ObjectPattern') {
                throw new Error(
                  `variable declaration with createTenv() is not an ObjectPattern, but "${path.node.id.type}"`,
                );
              }

              let serviceVar = '';
              for (const prop of path.node.id.properties) {
                if (
                  prop.type === 'Property' &&
                  prop.key.type === 'Identifier' &&
                  prop.key.name === 'service'
                ) {
                  if (prop.value.type !== 'Identifier') {
                    throw new Error(
                      `property value for "service" declaration not an Identifier, but "${prop.value.type}"`,
                    );
                  }
                  serviceVar = prop.value.name;
                }
              }

              if (serviceVar) {
                console.group(
                  `Variable "service" (as "${serviceVar}") declared at ${loc(path, true)}`,
                );
                using _ = defer(() => console.groupEnd());

                // TODO: shadowed variables not supported
                root
                  // service()
                  .find(j.CallExpression, {
                    callee: {
                      type: 'Identifier',
                      name: serviceVar,
                    },
                  })
                  .forEach((path) => {
                    const arg0 = path.node.arguments[0];
                    if (arg0?.type !== 'Literal') {
                      throw new Error(
                        'TODO: get variable value when literal is not used in "service()" argument',
                      );
                    }

                    const service = arg0.value!.toString();
                    if (!(service in eenv.services)) {
                      console.log(
                        `Found distinct "service('${service}')" at ${loc(path, true)}`,
                      );
                      const port =
                        startingServicePort + Object.keys(eenv.services).length;
                      console.log(
                        `Adding service "${service}" with port "${port}"`,
                      );
                      eenv.services[service] = { port };
                    }
                  });
              }
            });
        });
    });

  return eenv;
}

export interface PortForService {
  [service: string]: number /* port */;
}

/**
 * Transforms the given source code by finding and replacing all service ports using the
 * {@link Eenv.services services} from the provided {@link eenv}.
 */
export function transformServicePorts(eenv: Eenv, source: string): string {
  const root = j(source);

  let removeOptsVarDeclarator: Collection | undefined;

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
        .forEach((createTenvImport) => {
          console.group(
            `Processing imported "Opts" (as "${createTenvImport.local!.name}") at ${loc(createTenvImport, true)}`,
          );
          using _ = defer(() => console.groupEnd());

          root
            // ?.getServicePort()
            .find(j.CallExpression, {
              callee: {
                type: 'MemberExpression',
                property: {
                  name: 'getServicePort',
                },
              },
            })
            .filter((path) => {
              const callee = path.node.callee;
              if (callee.type !== 'MemberExpression') {
                // should never happen because of filter in find
                throw new Error(
                  `getServicePort() callee is not a MemberExpression, but "${callee.type}"`,
                );
              }

              if (
                callee.object.type === 'CallExpression' &&
                callee.object.callee.type === 'Identifier' &&
                callee.object.callee.name === createTenvImport.local!.name
              ) {
                // Opts().getServicePort()
                return true;
              }

              if (callee.object.type === 'Identifier') {
                removeOptsVarDeclarator = root
                  // const opts = Opts()
                  .find(j.VariableDeclarator, {
                    id: {
                      type: 'Identifier',
                      name: callee.object.name,
                    },
                    init: {
                      callee: {
                        name: createTenvImport.local!.name,
                      },
                    },
                  })
                  .forEach((path) => {
                    if (path.node.id.type !== 'Identifier') {
                      throw new Error(
                        `opts variable declaration id is not an Identifier, but "${callee.type}"`,
                      );
                    }
                    console.log(
                      `Variable "${path.node.id.name}" declared with "${createTenvImport.local!.name}()" at ${loc(path)}, removing...`,
                    );
                  });

                // const opts = Opts()
                // opts.getServicePort()
                return removeOptsVarDeclarator.length > 0;
              }

              return false;
            })
            .forEach((path) => {
              const arg0 = path.node.arguments[0];
              if (arg0?.type !== 'Literal') {
                throw new Error(
                  'TODO: get variable value when literal is not used in "opts.getServicePort" argument',
                );
              }

              const serviceName = arg0.value!.toString();

              const port = eenv.services[serviceName]?.port;
              if (!port) {
                throw new Error(`Port for service "${serviceName}" not found`);
              }

              console.log(
                `Replacing "?.getServicePort('${serviceName}')" with "${port}" at ${loc(path, true)}`,
              );

              j(path).replaceWith(j.literal(port)); // replace opts.portForService('foo') with port literal
            });
        });
    })
    .remove(); // remove all import '@internal/testing'

  removeOptsVarDeclarator?.remove();

  return root.toSource();
}

interface ServiceLocation {
  type: 'dir' | 'file';
  path: string;
  relativePath: string;
}

async function findServiceLocation(
  cwd: string,
  service: string,
): Promise<ServiceLocation> {
  let loc = path.join(cwd, 'services', service);
  if (await exists(loc)) {
    return { type: 'dir', path: loc, relativePath: path.relative(cwd, loc) };
  }

  loc += '.ts';
  if (await exists(loc)) {
    return { type: 'file', path: loc, relativePath: path.relative(cwd, loc) };
  }

  throw new Error(`Service "${service}" location not found in "${cwd}"`);
}
