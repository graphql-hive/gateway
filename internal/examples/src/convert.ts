import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { spawn, waitForPort } from '@internal/proc';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import dedent from 'dedent';
import { glob } from 'glob';
import jscodeshift, { Collection } from 'jscodeshift';
import { parser } from './parser';
import {
  asyncDefer,
  copyMkdir,
  defer,
  exists,
  loc,
  writeFileMkdir,
} from './utils';

const j = jscodeshift.withParser(parser);

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const __project = path.resolve(__dirname, '..', '..', '..');

/**
 * Published packages from changesets. Matches `publishedPackages` output in:
 * - https://github.com/dotansimha/changesets-action
 * - https://github.com/the-guild-org/changesets-snapshot-action
 */
export type PublishedPackages = { name: string; version: string }[];

export interface ConvertE2EToExampleConfig {
  /** The name of the E2E test to convert to an example. */
  e2e: string;
  /**
   * Whether to clean the example directory before converting.
   * @default false
   */
  clean?: boolean;
  /**
   * Whether to skip testing the generated example.
   * @default false
   */
  skipTest?: boolean;
  /**
   * Read more at {@link PublishedPackages}.
   */
  publishedPackages?: PublishedPackages;
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
    console.warn('Cleaning example (skipping package-lock.json if exists)...');
    try {
      for (const file of await fs.readdir(exampleDir)) {
        if (file !== 'package-lock.json') {
          await fs.rm(path.join(exampleDir, file), { recursive: true });
        }
      }
    } catch {
      // noop
    }
  }

  console.log(`Converting E2E test "${e2eDir}" to an example "${exampleDir}"`);
  if (config.publishedPackages) {
    console.log(
      'Using publishedPackages',
      JSON.stringify(config.publishedPackages, null, '  '),
    );
  }
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

  const gatewayConfigTsFile = path.join(e2eDir, 'gateway.config.ts');
  if (await exists(gatewayConfigTsFile)) {
    console.group(`"gatway.config.ts" found, transforming service ports...`);
    using _ = defer(() => console.groupEnd());

    const source = transformServicePorts(
      eenv,
      await fs.readFile(gatewayConfigTsFile, 'utf8'),
    );
    const dest = path.join(exampleDir, 'gateway.config.ts');
    console.log(`Writing "${path.relative(__project, dest)}"`);
    await fs.writeFile(dest, source);
  }

  const meshConfigTsFile = path.join(e2eDir, 'mesh.config.ts');
  // TODO: improve detection of composition by reading test files
  const composesWithMesh = await exists(meshConfigTsFile);
  const composesWithApollo =
    eenv.hasExampleSetup ||
    // if composition does not happen with mesh, it's very likely it happens with apollo
    !composesWithMesh;
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
        schema: { subgraph_url: `http://0.0.0.0:${port}/graphql` },
      };
    }

    const dest = path.join(exampleDir, 'supergraph.json');
    console.log(`Writing "${path.relative(__project, dest)}"`);
    await fs.writeFile(dest, JSON.stringify(supergraphConfig, null, '  '));
  } else {
    throw new Error('Composition of supergraph.graphql does not happen');
  }

  for (const extraDirOrFile of await glob(path.join(e2eDir, '*'))) {
    if (
      // not transformed directories/files
      ![
        'package.json',
        'gateway.config.ts',
        'mesh.config.ts',
        'services',
      ].includes(path.basename(extraDirOrFile)) &&
      // not a testfile
      !path.basename(extraDirOrFile).includes('.e2e.') &&
      // not a bench
      !path.basename(extraDirOrFile).includes('.bench.') &&
      // not a memtest
      !path.basename(extraDirOrFile).includes('.memtest.') &&
      // not a dockerile
      !path.basename(extraDirOrFile).includes('Dockerfile') &&
      // not test snapshots
      !path.basename(extraDirOrFile).includes('__snapshots__')
    ) {
      console.log(
        `Found extra at "${path.relative(e2eDir, extraDirOrFile)}", copying to "${path.relative(__project, exampleDir)}"`,
      );
      await copyMkdir(
        extraDirOrFile,
        path.join(exampleDir, path.basename(extraDirOrFile)),
      );
    }
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
        await copyMkdir(serviceFile.path, dest);
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

  const tasks: Task[] = [];
  let packageJson: any;

  {
    console.group('Transforming package.json...');
    using _0 = defer(() => console.groupEnd());

    packageJson = JSON.parse(
      await fs.readFile(path.join(e2eDir, 'package.json'), 'utf8'),
    );

    const name = `@example/${path.basename(exampleDir)}`;
    packageJson.name = name;
    console.log(`Set name to "${name}"`);

    if ('devDependencies' in packageJson) {
      console.log('Moving devDependencies to dependencies...');
      packageJson.dependencies ||= {};
      packageJson.dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
      packageJson.devDependencies = {};
    }

    const gatewayVersion = await getWorkspaceVersion(
      '@graphql-hive/gateway',
      config.publishedPackages,
    );
    console.log(
      `Adding "@graphql-hive/gateway@^${gatewayVersion}" as dependency...`,
    );
    packageJson.dependencies['@graphql-hive/gateway'] = `^${gatewayVersion}`;

    for (const [name, version] of Object.entries(packageJson.dependencies)) {
      const [, range] = String(version).split('workspace:');
      if (!range) continue;

      const workspaceVersion = await getWorkspaceVersion(
        name,
        config.publishedPackages,
      );
      if (range === '^') {
        packageJson.dependencies[name] = `^${workspaceVersion}`;
      } else if (range === '~') {
        packageJson.dependencies[name] = `~${workspaceVersion}`;
      } else {
        packageJson.dependencies[name] = workspaceVersion;
      }

      console.log(
        `Resolving "${name}@${version}" to version "${packageJson.dependencies[name]}"...`,
      );
    }

    if (Object.keys(eenv.services).length) {
      const { version } = await import('tsx/package.json');
      console.log(
        `Adding "tsx@${version}" dev dependency because there are services...`,
      );
      packageJson.devDependencies ||= {};
      packageJson.devDependencies['tsx'] = `^${version}`;
      packageJson.overrides ||= {};
      const { version: esbuildVersion } = await import('esbuild/package.json');
      packageJson.overrides['esbuild'] = `^${esbuildVersion}`;
    }

    if (composesWithApollo) {
      const { version } = await import('@apollo/rover/package.json');
      console.log(
        `Adding "@apollo/rover@${version}" dev dependency because composition is done with Apollo...`,
      );
      packageJson.devDependencies ||= {};
      packageJson.devDependencies['@apollo/rover'] = `^${version}`;
    }

    {
      console.group('Adding scripts and setup...');
      using _1 = defer(() => console.groupEnd());

      tasks.push({
        name: 'Install',
        command: 'npm i',
      });

      const scripts: Record<string, string> = {};
      for (const [script, command] of Object.entries(
        packageJson.scripts || {},
      )) {
        console.log(`Adding custom script "${script}" to setup...`);
        tasks.push({
          name: `Run ${script}`,
          command: `npm run ${script}`,
        });
        scripts[script] = String(command);
      }
      for (const [service, { port, https }] of Object.entries(eenv.services)) {
        const serviceFiles = await findServiceFiles(exampleDir, service);

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

        tasks.push({
          name: `Start service ${service}`,
          // command: `nohup npm run service:${service} &> service-${service}.out &`,
          command: `npm run service:${service}`,
          background: {
            service,
            wait: {
              name: `Wait for service ${service}`,
              command: `curl --retry-connrefused --retry 10 --retry-delay 3 ${https ? '-k https' : 'http'}://0.0.0.0:${port}`,
            },
          },
        });
      }

      if (composesWithMesh) {
        scripts['compose'] = 'mesh-compose -o supergraph.graphql';
      } else if (composesWithApollo) {
        scripts['compose'] =
          'rover supergraph compose --elv2-license=accept --config supergraph.json --output supergraph.graphql';
      }
      if (composes) {
        tasks.push({
          name: 'Compose',
          command: 'npm run compose',
        });
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
    console.group('Generating README.md...');
    using _ = defer(() => console.groupEnd());

    let readme = `# ${config.e2e}\n\n`;

    if (packageJson.description) {
      readme += `${packageJson.description}\n\n`;
    }

    readme += `## How to open in CodeSandbox?\n\n`;

    readme +=
      'This example is available online as a [CodeSandbox Devbox](https://codesandbox.io/docs/learn/devboxes/overview).\n\n';

    readme += `Visit [githubbox.com/graphql-hive/gateway/tree/main/examples/${config.e2e}](https://githubbox.com/graphql-hive/gateway/tree/main/examples/${config.e2e}).\n\n`;

    readme += `ℹ️ You can open an example from other branches by changing the \`/tree/main\` to the branch name (\`/tree/<branch_name>\`) in the URL above.\n\n`;

    readme += `## How to run locally?\n\n`;

    readme += dedent`
        1. Download example
           \`\`\`sh
           curl -L https://github.com/graphql-hive/gateway/raw/refs/heads/main/examples/${config.e2e}/example.tar.gz | tar -x
           \`\`\`

           ℹ️ You can download examples from other branches by changing the \`/refs/heads/main\` to the branch name (\`/refs/heads/<branch_name>\`) in the URL above.
        `;

    readme += '\n\n';

    for (const { name, command } of [
      {
        name: 'Open example',
        command: `cd ${config.e2e}`,
      },
      ...tasks,
      { name: 'Start the gateway', command: 'npm run gateway' },
    ]) {
      readme += dedent`
        1. ${name}
           \`\`\`sh
           ${command}
           \`\`\`
        `;
      readme += '\n';
    }

    readme += '\n';
    readme +=
      '🚀 Then visit [localhost:4000/graphql](http://localhost:4000/graphql) to see Hive Gateway in action!\n\n';

    readme += dedent`
    ## Note

    This example was auto-generated from the [${config.e2e} E2E test](/e2e/${config.e2e}) using our [example converter](/internal/examples).

    You can browse the [${config.e2e}.e2e.ts test file](/e2e/${config.e2e}/${config.e2e}.e2e.ts) to understand what to expect.
    `;
    readme += '\n';

    const dest = path.join(exampleDir, 'README.md');
    console.log(`Writing "${path.relative(__project, dest)}"`);
    await fs.writeFile(dest, readme);
  }

  {
    console.group('Defining codesandbox setup and tasks...');
    using _ = defer(() => console.groupEnd());

    const tasksJson = JSON.stringify(
      {
        setupTasks: tasks.flatMap(({ background, ...task }) =>
          background
            ? [
                {
                  name: task.name,
                  command: `nohup ${task.command} &> service-${background.service}.out &`,
                },
                background.wait,
              ]
            : task,
        ),
        tasks: {
          gateway: {
            name: 'Hive Gateway',
            runAtStart: true,
            command: 'npm run gateway',
            preview: {
              port: 4000,
            },
          },
        },
      },
      null,
      '  ',
    );
    console.log(tasksJson);

    const dest = path.join(exampleDir, '.codesandbox', 'tasks.json');
    console.log(`Writing "${path.relative(__project, dest)}"`);
    await writeFileMkdir(dest, tasksJson);
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

  if (!config.skipTest) {
    console.log('Testing example...');

    console.log('Hiding root node_modules and tsconfig.json');
    const hiddenPrefix = 'HIDDEN_';
    await Promise.all([
      fs.rename(
        path.join(__project, 'node_modules'),
        path.join(__project, `${hiddenPrefix}node_modules`),
      ),
      fs.rename(
        path.join(__project, 'tsconfig.json'),
        path.join(__project, `${hiddenPrefix}tsconfig.json`),
      ),
    ]);
    await using _ = asyncDefer(() => {
      console.log('Restoring root node_modules and tsconfig.json');
      return Promise.all([
        fs.rename(
          path.join(__project, `${hiddenPrefix}node_modules`),
          path.join(__project, 'node_modules'),
        ),
        fs.rename(
          path.join(__project, `${hiddenPrefix}tsconfig.json`),
          path.join(__project, 'tsconfig.json'),
        ),
      ]);
    });

    {
      console.group('Testing codesandbox setup and starting Hive Gateway...');
      using _ = defer(() => console.groupEnd());

      await using stack = new AsyncDisposableStack();

      for (const { background, ...task } of tasks) {
        console.log(`Running "${task.name}"...`);

        const [proc, waitForExit] = await spawn(
          {
            cwd: exampleDir,
            signal: background ? undefined : AbortSignal.timeout(60_000),
          },
          ...cmdAndArgs(task),
        );
        if (background) {
          console.info(
            'Task is a background job, making sure it starts and not waiting for exit',
          );

          // wait 1 second and see whether the process will fail
          await Promise.race([waitForExit, setTimeout(1_000)]);

          stack.use(proc);

          console.log(`Running "${background.wait.name}"...`);
          await spawn(
            {
              cwd: exampleDir,
              signal: AbortSignal.timeout(60_000),
            },
            ...cmdAndArgs(background.wait),
          );
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
      const res = await fetch('http://0.0.0.0:4000/healthcheck');
      if (!res.ok) {
        throw new Error('Hive Gateway not healthy');
      }
    }

    console.log('Ok');
  } else {
    console.log('Skipping example tests...');
  }

  // we create an example archive after testing because it might've changed the package-lock.json
  {
    console.group('Creating an example archive...');
    using _ = defer(() => console.groupEnd());

    // https://reproducible-builds.org/docs/archives/
    const [, waitForExit] = await spawn(
      {
        cwd: path.join(__project, 'examples'),
        env: {
          // remove timestamps from gzip
          GZIP: '-n',
        },
      },
      'tar',
      // consistent sort of files (by default tar sorts files by order of the filesystem)
      '--sort=name',
      // set modify time to zero
      '--mtime="@0"',
      // set default permissions and owners
      '--mode=a+rwX',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      // PAX headers
      '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime',
      // create gzip
      '-cz',
      // filename
      '-f',
      `${config.e2e}.tar.gz`,
      // respect .gitignore
      `--exclude-from=${path.join(__project, '.gitignore')}`,
      // skip node_modules
      `--exclude=${config.e2e}/node_modules`,
      // skip existing example archive
      `--exclude=${config.e2e}/example.tar.gz`,
      config.e2e,
    );
    await waitForExit;

    await fs.rename(
      path.join(__project, 'examples', `${config.e2e}.tar.gz`),
      path.join(__project, 'examples', config.e2e, 'example.tar.gz'),
    );
  }
}

interface Task {
  /** Human-friendly name of the task. */
  name: string;
  /** The command to execute. */
  command: string;
  /**
   * If set, marks this task as a background task. Background tasks are ran with `nohup`.
   *
   * The provided `wait` task definition is the task waiting for the background task's avilability.
   */
  background?: {
    service: string;
    wait: Omit<Task, 'background'>;
  };
}

function cmdAndArgs(task: Task): [cmd: string, ...args: string[]] {
  const [cmd, ...args] = task.command.split(' ');
  if (!cmd) {
    throw new Error(`Task "${task.name}" does not have a command`);
  }
  return [cmd, ...args];
}

/** Parsing an E2E `Tenv` creates and `Eenv` (Example environment). */
export interface Eenv {
  gateway: { port: number };
  hasExampleSetup: boolean;
  services: { [name: string]: { port: number; https?: true } };
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
                // @ts-expect-error - TODO: fix this
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
                // @ts-expect-error - TODO: fix this
                type: 'CallExpression',
                callee: {
                  // @ts-expect-error - TODO: fix this
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
                      const arg1 = path.node.arguments[1];
                      const https =
                        // { protocol: 'https' }
                        arg1?.type === 'ObjectExpression' &&
                        arg1.properties.find(
                          (prop) =>
                            prop.type === 'ObjectProperty' &&
                            prop.key.type === 'Identifier' &&
                            prop.key.name === 'protocol' &&
                            prop.value.type === 'StringLiteral' && // TODO: support non-literals
                            prop.value.value === 'https',
                        );

                      console.log(
                        `Found distinct "service('${service}'${https ? ", { protocol: 'https\' }" : ''})" at ${loc(path, true)}`,
                      );

                      const port =
                        startingServicePort + Object.keys(eenv.services).length;
                      console.log(
                        `Adding service "${service}" with port "${port}"${https ? ' using https protocol' : ''}`,
                      );
                      eenv.services[service] = { port };
                      if (https) {
                        eenv.services[service].https = true;
                      }
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

const workspaces: { [name: string]: string /* location */ } = {};

/**
 * Gets the workspace's current version as defined in the package.json.
 *
 * If the package exists in {@link publishedPackage}, its version will be used instead.
 */
async function getWorkspaceVersion(
  name: string,
  /**
   * Read more at {@link PublishedPackages}.
   */
  publishedPackages: PublishedPackages | undefined,
) {
  const publishedPackage = publishedPackages?.find((pkg) => pkg.name === name);
  if (publishedPackage) {
    return publishedPackage.version;
  }

  if (!Object.keys(workspaces).length) {
    const [proc, waitForExit] = await spawn(
      { cwd: __project },
      'yarn',
      'workspaces',
      'list',
      '--json',
    );
    await waitForExit;
    for (const line of proc.getStd('out').split('\n')) {
      if (line) {
        const workspace: { location: string; name: string } = JSON.parse(line);
        workspaces[workspace.name] = workspace.location;
      }
    }
  }

  const location = workspaces[name];
  if (!location) {
    throw new Error(`Workspace "${name}" does not exist`);
  }

  return JSON.parse(
    await fs.readFile(path.join(__project, location, 'package.json'), 'utf8'),
  ).version;
}
