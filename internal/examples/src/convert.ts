import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, waitForPort } from '@internal/proc';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { glob } from 'glob';
import jscodeshift, { Collection } from 'jscodeshift';
// @ts-expect-error there is a ts parser but it's not properly typed
import tsParser from 'jscodeshift/parser/ts';
import { copyFileMkdir, defer, exists, loc, writeFileMkdir } from './utils';

const j = jscodeshift.withParser(tsParser());

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const __project = path.resolve(__dirname, '..', '..', '..');

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
  // TODO: improve detection of composition by reading test files
  const composesWithMesh = await exists(meshConfigTsFile);
  const composesWithApollo = eenv.hasExampleSetup;
  const composes = composesWithMesh || composesWithApollo;
  if (composesWithMesh) {
    console.group(`"mesh.config.ts" found, transforming service ports...`);
    using _ = defer(() => console.groupEnd());

    const source = transformServicePorts(
      eenv,
      await fs.readFile(meshConfigTsFile, 'utf8'),
    );
    const dest = path.join(exampleDir, 'mesh.config.ts');
    console.log(`Writing "${path.relative(__project, dest)}"`);
    await fs.writeFile(dest, source);
  } else if (composesWithApollo) {
    console.group(`Composing with Apollo, creating config...`);
    using _ = defer(() => console.groupEnd());

    const supergraphConfig: {
      federation_version: string;
      subgraphs: { [name: string]: { schema: { subgraph_url: string } } };
    } = {
      federation_version: '=2.9.0',
      subgraphs: {},
    };

    for (const [service, { port }] of Object.entries(eenv.services)) {
      supergraphConfig.subgraphs[service] = {
        schema: { subgraph_url: `http://localhost:${port}/graphql` },
      };
    }

    const dest = path.join(exampleDir, 'supergraph.json');
    console.log(`Writing "${path.relative(__project, dest)}"`);
    await fs.writeFile(dest, JSON.stringify(supergraphConfig, null, '  '));
  } else {
    throw new Error('Composition of supergraph.graphql does not happen');
  }

  for (const service of Object.keys(eenv.services)) {
    for (const serviceFile of await findServiceFiles(e2eDir, service)) {
      console.group(
        `service file "${path.relative(e2eDir, serviceFile.path)}" found`,
      );
      using _ = defer(() => console.groupEnd());

      const dest = path.join(exampleDir, serviceFile.relativePath);

      const ext = path.extname(serviceFile.path);
      if (ext !== '.ts' && ext !== '.js') {
        console.log(
          `not a JavaScript/TypeScript file, copying to "${path.relative(__project, dest)}"`,
        );
        await copyFileMkdir(serviceFile.path, dest);
        continue;
      }

      console.log(`transforming service ports...`);

      const source = transformServicePorts(
        eenv,
        await fs.readFile(serviceFile.path, 'utf8'),
      );

      console.log(`Writing "${path.relative(__project, dest)}"`);
      await writeFileMkdir(dest, source);
    }
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

    if ('devDependencies' in packageJson) {
      console.log('Moving devDependencies to dependencies...');
      packageJson.dependencies ||= {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
      packageJson.devDependencies = {};
    }

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
      const version = '^4.19.2'; // TODO: use the version from root package.json
      console.log(
        `Adding "tsx@${version}" dev dependency because there are services...`,
      );
      packageJson.devDependencies ||= {};
      packageJson.devDependencies['tsx'] = version;
    }

    if (composesWithApollo) {
      const version = '^0.26.3'; // TODO: use the latest version
      console.log(
        `Adding "@apollo/rover@${version}" dev dependency because composition is done with Apollo...`,
      );
      packageJson.devDependencies ||= {};
      packageJson.devDependencies['@apollo/rover'] = version;
    }

    {
      console.group('Adding scripts...');
      using _1 = defer(() => console.groupEnd());

      const scripts: Record<string, string> = {};
      for (const service of Object.keys(eenv.services)) {
        const serviceFiles = await findServiceFiles(exampleDir, service);

        // will be used in tasks.json
        if (serviceFiles.length === 1) {
          scripts[`service:${service}`] =
            `tsx ${serviceFiles[0]!.relativePath}`;
        } /** serviceFiles.length > 1 */ else {
          const indexFile = serviceFiles.find((f) =>
            f.relativePath.endsWith('index.ts'),
          );
          if (!indexFile) {
            throw new Error(
              `Service "${service}" has multiple service files but no index.ts`,
            );
          }
          scripts[`service:${service}`] = `tsx ${indexFile.relativePath}`;
        }
      }
      if (composesWithMesh) {
        scripts['compose'] = 'mesh-compose -o supergraph.graphql';
      } else if (composesWithApollo) {
        scripts['compose'] =
          'rover supergraph compose --config supergraph.json --output supergraph.graphql';
      }
      scripts['gateway'] = 'hive-gateway supergraph';

      console.log(JSON.stringify(scripts, null, '  '));
      packageJson.scripts = scripts;
    }

    const dest = path.join(exampleDir, 'package.json');
    console.log(`Writing "${path.relative(__project, dest)}"`);
    await fs.writeFile(dest, JSON.stringify(packageJson, null, '  '));
  }

  {
    console.group('Adding devcontainer...');
    using _ = defer(() => console.groupEnd());

    const dest = path.join(exampleDir, '.devcontainer', 'devcontainer.json');
    console.log(`Writing "${path.relative(__project, dest)}"`);
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
    console.log(`Writing "${path.relative(__project, dest)}"`);
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

    console.log('Checking Hive Gateway health...');
    const res = await fetch('http://localhost:4000/healthcheck');
    if (!res.ok) {
      throw new Error('Hive Gateway not healthy');
    }
  }

  console.log('Ok');
}

/** Parsing an E2E `Tenv` creates and `Eenv` (Example environment). */
export interface Eenv {
  gateway: { port: number };
  hasExampleSetup: boolean;
  services: { [name: string]: { port: number } };
}

/** Parses a source file containing `createTenv` and creates an {@link Eenv} from it. */
export function parseTenv(source: string): Eenv {
  const root = j(source);

  const eenv: Eenv = {
    gateway: { port: 4000 },
    hasExampleSetup: false,
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

              eenv.hasExampleSetup = true;

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
                  prop.type === 'ObjectProperty' &&
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
                    if (arg0?.type !== 'StringLiteral') {
                      throw new Error(
                        `TODO: get variable value when StringLiteral is not used in "service()" argument, but "${arg0?.type} is"`,
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
              if (arg0?.type !== 'StringLiteral') {
                throw new Error(
                  `TODO: get variable value when StringLiteral is not used in "opts.getServicePort()" argument, but "${arg0?.type} is"`,
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

interface ServiceFile {
  path: string;
  relativePath: string;
}

async function findServiceFiles(
  cwd: string,
  service: string,
): Promise<ServiceFile[]> {
  const serviceFiles: ServiceFile[] = [];
  for (const potentialCwd of [
    cwd,
    path.resolve(__dirname, '..', '..', 'e2e', 'src'), // @internal/e2e#createExampleSetup
  ]) {
    const filePath = path.join(potentialCwd, 'services', service + '.ts');
    if (await exists(filePath)) {
      serviceFiles.push({
        path: filePath,
        relativePath: path.relative(potentialCwd, filePath),
      });
      break; // there can be only one service file
    }

    const dirPath = path.join(potentialCwd, 'services', service);
    if (await exists(dirPath)) {
      for (const filePath of await glob(path.join(dirPath, '**/*'))) {
        serviceFiles.push({
          path: filePath,
          relativePath: path.relative(potentialCwd, filePath),
        });
      }
      break;
    }
  }
  if (!serviceFiles.length) {
    throw new Error(`No service files found for "${service}"`);
  }
  return serviceFiles;
}
