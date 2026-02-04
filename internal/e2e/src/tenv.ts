import fs from 'fs/promises';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path, { isAbsolute } from 'path';
import { setTimeout } from 'timers/promises';
import { inspect } from 'util';
import {
  IntrospectAndCompose,
  RemoteGraphQLDataSource,
  type ServiceEndpointDefinition,
} from '@apollo/gateway';
import { createDeferred, fakePromise } from '@graphql-tools/utils';
import { Proc, ProcOptions, Server, spawn, waitForPort } from '@internal/proc';
import {
  createOpt,
  createPortOpt,
  createServicePortOpt,
  getLocalhost,
  isDebug,
  ResponseError,
} from '@internal/testing';
import { cancelledSignal } from '@internal/testing/vitest';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { fetch } from '@whatwg-node/fetch';
import { getEnvBool, isCI } from '~internal/env';
import Dockerode from 'dockerode';
import { glob } from 'glob';
import type { ExecutionResult } from 'graphql';
import { leftoverStack } from './leftoverStack';
import { interval, retries } from './timeout';

const __project = path.resolve(__dirname, '..', '..', '..') + path.sep;

const docker = new Dockerode();

const E2E_GATEWAY_RUNNERS = [
  'node',
  'docker',
  'bin',
  'bun',
  'bun-docker',
] as const;

type ServeRunner = (typeof E2E_GATEWAY_RUNNERS)[number];

const gatewayRunner = (function getServeRunner() {
  const runner = (process.env['E2E_GATEWAY_RUNNER'] || 'node')
    .trim()
    .toLowerCase();
  if (
    !E2E_GATEWAY_RUNNERS.includes(
      // @ts-expect-error
      runner,
    )
  ) {
    throw new Error(
      `Unsupported E2E gateway runner "${runner}"; supported runners are ${E2E_GATEWAY_RUNNERS}`,
    );
  }
  if (runner === 'docker' && !isCI()) {
    process.stderr.write(`
⚠️ Using docker gateway runner! Make sure you have built the containers with:
yarn build && E2E_GATEWAY_RUNNER=docker yarn workspace @graphql-hive/gateway bundle && docker buildx bake e2e

`);
  }
  if (runner === 'bin' && !isCI()) {
    process.stderr.write(`
⚠️ Using bin gateway runner! Make sure you have built the binary with:
yarn build && yarn workspace @graphql-hive/gateway bundle && yarn workspace @graphql-hive/gateway tsx scripts/package-binary

`);
  }
  if (runner === 'bun-docker' && !isCI()) {
    process.stderr.write(`
⚠️ Using docker gateway runner! Make sure you have built the containers with:
yarn build && E2E_GATEWAY_RUNNER=bun-docker yarn workspace @graphql-hive/gateway bundle && docker buildx bake e2e_bun

`);
  }
  return runner as ServeRunner;
})();

export interface GatewayOptions extends ProcOptions {
  port?: number;
  /** Extra args to pass to the process. */
  args?: (string | number | boolean)[];
  /**
   * Path to the supergraph file or {@link ComposeOptions} which will be used for composition with GraphQL Mesh.
   * If {@link ComposeOptions} is provided, its {@link ComposeOptions.output output} will always be set to `graphql`;
   */
  supergraph?:
    | string
    | {
        with: 'mesh';
        services?: Service[];
        env?: Record<string, string | number>;
      }
    | {
        with: 'apollo';
        services: Service[];
        env?: Record<string, string | number>;
      };
  /**
   * Path to the subgraph file or {@link ComposeOptions} which will be used for composition with GraphQL Mesh.
   * If {@link ComposeOptions} is provided, its {@link ComposeOptions.output output} will always be set to `graphql`;
   */
  subgraph?:
    | string
    | {
        with: 'mesh';
        subgraphName: string;
        services?: Service[];
        pipeLogs?: boolean | string;
      };
  /** {@link gatewayRunner Gateway Runner} specific options. */
  runner?: {
    /** "docker" specific options. */
    docker?: Partial<Pick<ContainerOptions, 'volumes' | 'healthcheck'>>;
  };
  services?: Service[];
  /**
   * Protocol to use for the gateway.
   * @default http
   */
  protocol?: string;
}

export interface Gateway extends Server {
  execute(args: {
    query?: string;
    variables?: Record<string, unknown>;
    operationName?: string;
    headers?: Record<string, string>;
    extensions?: Record<string, unknown>;
  }): Promise<ExecutionResult<any>>;
}

export interface ServiceOptions extends ProcOptions {
  /** Extra args to pass to the process. */
  args?: (string | number | boolean)[];
  /**
   * Custom port of this service.
   *
   * @default getAvailablePort()
   */
  port?: number;
  /**
   * Custom port of the gateway instance.
   * Is set to the `--port` argument (available under `Args.getPort()`).
   */
  gatewayPort?: number;
  /**
   * Protocol to use for the service.
   * @default http
   */
  protocol?: string;
  /**
   * Services dependent on this service.
   * It will supply `--<service.name>_port=<service.port>` arguments to the process.
   */
  services?: Service[];
}

export interface Service extends Server {
  name: string;
}

export interface ComposeOptions extends ProcOptions {
  /** Extra args to pass to the process. */
  args?: (string | number | boolean)[];
  /**
   * Write the compose output/result to a temporary unique file with the extension.
   * The file will be deleted after the tests complete.
   */
  output?: 'graphql' | 'json' | 'js' | 'ts';
  /**
   * Services relevant to the compose process.
   * It will supply `--<service.name>_port=<service.port>` arguments to the process.
   */
  services?: Service[];
  /** Trim paths to not include the absolute host path in the result. */
  trimHostPaths?: boolean;
  /** Mask the service ports in the result. */
  maskServicePorts?: boolean;
}

export interface Compose extends Proc {
  /**
   * The path to the composed file.
   * If output was not specified in the options, an empty string will be provided.
   */
  output: string;
  result: string;
}

export interface ContainerOptions extends ProcOptions {
  /** Extra args to pass to the process. */
  args?: (string | number | boolean)[];
  /**
   * Name of the service.
   * Note that the actual Docker container name will have a unique suffix
   * and will be available at {@link Container.containerName}.
   */
  name: string;
  /**
   * Name of the image to use for the container.
   *
   * If the image name exists as a literal in any of the tags in the docker-bake.hcl
   * file, that local image baked image will be used. So dont forget to bake before
   * running the tests.
   *
   * Otherwise, the image gets pulled.
   */
  image: string;
  /**
   * Port that the container uses.
   *
   * Will be bound to the {@link hostPort}.
   */
  containerPort: number;
  /**
   * Additional ports from the container to expose.
   */
  additionalContainerPorts?: number[];
  /**
   * Port that will be bound to the {@link containerPort}.
   *
   * @default getAvailablePort()
   */
  hostPort?: number;
  /**
   * The healthcheck test command to run on the container.
   * If provided, the run function will wait for the container to become healthy.
   */
  healthcheck: string[];
  /** Docker CMD to pass to the container when running. */
  cmd?: (string | number | boolean)[];
  /** Volume bindings for the container relative to the cwd of Tenv. */
  volumes?: { host: string; container: string }[];
  /**
   * Protocol to use for the container.
   * @default http
   */
  protocol?: string;
}

export interface Container extends Service {
  /** The name of running Docker container.  */
  containerName: string;
  /** Host port binding to the {@link ContainerOptions.containerPort}. */
  port: number;
  /** A map of {@link ContainerOptions.additionalContainerPorts additional container ports} to the ports on the host. */
  additionalPorts: Record<number, number>;
}

export interface Tenv {
  fs: {
    read(path: string): Promise<string>;
    delete(path: string): Promise<void>;
    tempfile(name: string, content?: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
  };
  spawn(
    command: string | (string | number)[],
    opts?: ProcOptions,
  ): Promise<[proc: Proc, waitForExit: Promise<void>]>;
  gatewayRunner: ServeRunner;
  gateway(opts?: GatewayOptions): Promise<Gateway>;
  /**
   * Starts a service by name. Services are services that serve data, not necessarily GraphQL.
   * The TypeScript service executable must be at `services/<name>.ts` or `services/<name>/index.ts`.
   * Port will be provided as an argument `--<name>_port=<port>` to the service.
   */
  service(name: string, opts?: ServiceOptions): Promise<Service>;
  container(opts: ContainerOptions): Promise<Container>;
  composeWithMesh(opts?: ComposeOptions): Promise<Compose>;
  composeWithApollo(opts: ComposeOptions): Promise<Compose>;
}

// docker for linux (which is used in the CI) will have the host be on 172.17.0.1,
// and locally the host.docker.internal (or just on macos?) should just work
export const dockerHostName = isCI() ? '172.17.0.1' : 'host.docker.internal';

export async function handleDockerHostNameInURLOrAtPath(
  supergraph: string,
  volumes: {
    host: string;
    container: string;
  }[],
) {
  if (/^http(s?):\/\//.test(supergraph)) {
    // supergraph is a url
    supergraph = replaceLocalhostWithDockerHost(supergraph);
  } else {
    // supergraph is a path
    await fs.writeFile(
      supergraph,
      replaceLocalhostWithDockerHost(await fs.readFile(supergraph, 'utf8')),
    );
    volumes.push({
      host: supergraph,
      container: `/gateway/${path.basename(supergraph)}`,
    });
    supergraph = path.basename(supergraph);
  }
  return supergraph;
}

export function replaceLocalhostWithDockerHost(str: string) {
  // we need to replace all local servers in the supergraph to use docker's local hostname.
  // without this, the services running on the host wont be accessible by the docker container
  return str
    .replaceAll('0.0.0.0', dockerHostName)
    .replaceAll('localhost', dockerHostName)
    .replaceAll('127.0.0.1', dockerHostName);
}

export function createTenv(cwd: string): Tenv {
  const tenv: Tenv = {
    fs: {
      read(filePath) {
        return fs.readFile(
          isAbsolute(filePath) ? filePath : path.join(cwd, filePath),
          'utf8',
        );
      },
      delete(filePath) {
        return fs.unlink(
          isAbsolute(filePath) ? filePath : path.join(cwd, filePath),
        );
      },
      async tempfile(name, content) {
        const tempDir = await fs.mkdtemp(
          path.join(os.tmpdir(), 'hive-gateway_e2e_fs'),
        );
        leftoverStack.defer(() => fs.rm(tempDir, { recursive: true }));
        const tempFile = path.join(tempDir, name);
        if (content) await fs.writeFile(tempFile, content, 'utf-8');
        return tempFile;
      },
      write(filePath, content) {
        return fs.writeFile(filePath, content, 'utf-8');
      },
    },
    spawn(command, opts) {
      const [cmd, ...args] = Array.isArray(command)
        ? command
        : command.split(' ');
      return spawn(
        {
          ...opts,
          signal: cancelledSignal,
          cwd,
          stack: leftoverStack,
          replaceStderr: (str) => str.replaceAll(__project, ''),
        },
        String(cmd),
        ...args,
      );
    },
    gatewayRunner,
    async gateway(opts) {
      let {
        port = await getAvailablePort(),
        supergraph: supergraphOpt,
        subgraph: subgraphOpt,
        pipeLogs = isDebug() || getEnvBool('E2E_PIPE_LOGS')
          ? 'gateway.out'
          : false,
        env,
        runner,
        args = [],
        services,
        protocol = 'http',
      } = opts || {};

      let proc: Proc,
        waitForExit: Promise<void> | null = null;

      let supergraph: string | null = null;
      if (typeof supergraphOpt === 'string') {
        supergraph = supergraphOpt;
      } else if (supergraphOpt?.with === 'mesh') {
        const { output } = await tenv.composeWithMesh({
          output: 'graphql',
          services: supergraphOpt.services,
          env: supergraphOpt.env,
        });
        supergraph = output;
      } else if (supergraphOpt?.with === 'apollo') {
        const { output } = await tenv.composeWithApollo({
          services: supergraphOpt.services,
        });
        supergraph = output;
      }

      let subgraph: string | null = null;
      if (typeof subgraphOpt === 'string') {
        subgraph = subgraphOpt;
      } else if (subgraphOpt?.with === 'mesh') {
        const { output } = await tenv.composeWithMesh({
          output: 'graphql',
          services: subgraphOpt?.services,
          args: ['--subgraph', subgraphOpt?.subgraphName],
          pipeLogs: subgraphOpt?.pipeLogs,
        });
        subgraph = output;
      }

      function getFullArgs() {
        return [
          createPortOpt(port),
          ...(supergraph ? ['supergraph', supergraph] : []),
          ...(subgraph ? ['subgraph', subgraph] : []),
          ...args,
          ...(services?.map(({ name, port }) =>
            createServicePortOpt(name, port),
          ) || []),
        ];
      }

      switch (gatewayRunner) {
        case 'bun-docker':
        case 'docker': {
          const volumes: ContainerOptions['volumes'] = [];

          if (runner?.docker?.volumes) {
            volumes.push(...runner.docker.volumes);
          }

          if (supergraph) {
            supergraph = await handleDockerHostNameInURLOrAtPath(
              supergraph,
              volumes,
            );
          }
          if (subgraph) {
            subgraph = await handleDockerHostNameInURLOrAtPath(
              subgraph,
              volumes,
            );
          }

          for (const configfile of await glob('gateway.config.*', {
            cwd,
          })) {
            volumes.push({
              host: configfile,
              container: `/gateway/${path.basename(configfile)}`,
            });
          }
          for (const dbfile of await glob('*.db', { cwd })) {
            volumes.push({
              host: dbfile,
              container: `/gateway/${path.basename(dbfile)}`,
            });
          }
          for (const additionalTypeDefFile of await glob(
            ['./additionalTypeDefs/*.graphql', './additionalTypeDefs/*.ts'],
            { cwd },
          )) {
            volumes.push({
              host: additionalTypeDefFile,
              container: `/gateway/additionalTypeDefs/${path.basename(additionalTypeDefFile)}`,
            });
          }
          const packageJsonExists = await fs
            .stat(path.join(cwd, 'package.json'))
            .then(() => true)
            .catch(() => false);
          if (packageJsonExists) {
            volumes.push({
              host: 'package.json',
              container: '/gateway/package.json',
            });
          }

          const dockerfileExists = await fs
            .stat(
              path.join(
                cwd,
                gatewayRunner === 'bun-docker'
                  ? 'gateway_bun.Dockerfile'
                  : 'gateway.Dockerfile',
              ),
            )
            .then(() => true)
            .catch(() => false);

          const cont = await tenv.container({
            env,
            name:
              'gateway-e2e-' +
              Math.random().toString(32).slice(6) +
              (gatewayRunner === 'bun-docker' ? '-bun' : ''),
            image:
              'ghcr.io/graphql-hive/gateway:' +
              (dockerfileExists
                ? // if the test contains a gateway dockerfile, use it instead of the default e2e image
                  `e2e.${path.basename(cwd)}`
                : 'e2e') +
              (gatewayRunner === 'bun-docker' ? '-bun' : ''),
            // TODO: changing port from within gateway.config.ts wont work in docker runner
            hostPort: port,
            containerPort: port,
            healthcheck: runner?.docker?.healthcheck || [
              'CMD-SHELL',
              `wget --spider ${protocol}://0.0.0.0:${port}/healthcheck`,
            ],
            cmd: getFullArgs(),
            volumes,
            pipeLogs,
          });
          proc = cont;
          break;
        }
        case 'bun': {
          [proc, waitForExit] = await spawn(
            {
              signal: cancelledSignal,
              env,
              cwd,
              pipeLogs,
              stack: leftoverStack,
              replaceStderr: (str) => str.replaceAll(__project, ''),
            },
            path.resolve(__project, 'node_modules', '.bin', 'bun'),
            path.resolve(__project, 'packages', 'gateway', 'src', 'bin.ts'),
            ...getFullArgs(),
          );
          break;
        }
        case 'node': {
          [proc, waitForExit] = await spawn(
            {
              signal: cancelledSignal,
              env,
              cwd,
              pipeLogs,
              stack: leftoverStack,
              replaceStderr: (str) => str.replaceAll(__project, ''),
            },
            'node',
            // use next available port when starting inspector (note that this does not start inspect, this still needs to be done manually)
            // it's not set because in JIT mode because it does not work together (why? no clue)
            args.includes('--jit') ? null : '--inspect-port=0',
            '--import',
            'tsx',
            path.resolve(__project, 'packages', 'gateway', 'src', 'bin.ts'),
            ...getFullArgs(),
          );
          break;
        }
        case 'bin': {
          [proc, waitForExit] = await spawn(
            {
              signal: cancelledSignal,
              env,
              cwd,
              pipeLogs,
              stack: leftoverStack,
              replaceStderr: (str) => str.replaceAll(__project, ''),
            },
            path.resolve(__project, 'packages', 'gateway', 'hive-gateway'),
            ...getFullArgs(),
          );
          break;
        }
        default:
          throw new Error(
            `Unsupported E2E gateway runner "${runner}"; supported runners are ${E2E_GATEWAY_RUNNERS}`,
          );
      }

      const gw: Gateway = {
        ...proc,
        port,
        protocol,
        async execute({ headers, ...args }) {
          try {
            const res = await fetch(`${protocol}://0.0.0.0:${port}/graphql`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                accept: 'application/graphql-response+json, application/json',
                ...headers,
              },
              body: JSON.stringify(args),
            });
            if (!res.ok) {
              const resText = await res.text();
              try {
                return JSON.parse(resText);
              } catch {
                // not a GraphQL error, something weird happened
              }
              throw new ResponseError({
                status: res.status,
                statusText: res.statusText,
                resText,
                proc,
              });
            }
            const resBody: ExecutionResult = await res.json();
            if (
              resBody?.errors?.some((error) =>
                error.message.includes('Unexpected'),
              )
            ) {
              process.stderr.write(proc.getStd('both'));
            }
            return resBody;
          } catch (err) {
            throw new Error(
              `Failed to execute query on gateway\n${proc.getStd('both')}\n${err}`,
            );
          }
        },
      };
      const ctrl = new AbortController();
      await Promise.race([
        waitForExit
          ?.then(() => {
            throw new Error(
              `Serve exited successfully, but shouldn't have\n${proc.getStd('both')}`,
            );
          })
          // stop reachability wait after exit
          .finally(() => ctrl.abort()),
        waitForReachable(gw, AbortSignal.any([ctrl.signal, cancelledSignal])),
      ]);
      return gw;
    },
    async composeWithMesh(opts) {
      const {
        services = [],
        trimHostPaths,
        maskServicePorts,
        pipeLogs = isDebug() || getEnvBool('E2E_PIPE_LOGS')
          ? 'mesh.out'
          : false,
        env,
        args = [],
      } = opts || {};
      let output = '';
      if (opts?.output) {
        const tempDir = await fs.mkdtemp(
          path.join(os.tmpdir(), 'graphql-mesh_e2e_compose'),
        );
        leftoverStack.defer(() => fs.rm(tempDir, { recursive: true }));
        output = path.join(
          tempDir,
          `${Math.random().toString(32).slice(2)}.${opts.output}`,
        );
      }
      const [proc, waitForExit] = await spawn(
        {
          signal: cancelledSignal,
          cwd,
          pipeLogs,
          env,
          stack: leftoverStack,
          replaceStderr: (str) => str.replaceAll(__project, ''),
        },
        'node',
        '--import',
        'tsx', // we use tsx because we want to leverage tsconfig paths
        path.join(
          __project,
          'node_modules',
          '@graphql-mesh',
          'compose-cli',
          'esm',
          'bin.js',
        ),
        output && createOpt('output', output),
        ...services.map(({ name, port }) => createServicePortOpt(name, port)),
        ...args,
      );
      await waitForExit;
      let result = '';
      if (output) {
        try {
          result = await fs.readFile(output, 'utf-8');
        } catch (err) {
          if (Object(err).code === 'ENOENT') {
            throw new Error(
              `Compose command has "output" argument but file was not created at ${output}`,
            );
          }
          throw err;
        }
      } else {
        result = proc.getStd('out');
      }

      result = applyMaskServicePorts(result, {
        services,
        trimHostPaths,
        maskServicePorts,
      });

      if (output) {
        await fs.writeFile(output, result, 'utf8');
      }

      return { ...proc, output, result };
    },
    async service(
      name,
      {
        port,
        gatewayPort,
        pipeLogs = isDebug() || getEnvBool('E2E_PIPE_LOGS')
          ? `${name}.out`
          : false,
        args = [],
        protocol = 'http',
        env,
        services,
      } = {},
    ) {
      port ||= await getAvailablePort();
      const ctrl = new AbortController();
      const [proc, waitForExit] = await spawn(
        {
          signal: AbortSignal.any([ctrl.signal, cancelledSignal]),
          cwd,
          pipeLogs,
          stack: leftoverStack,
          replaceStderr: (str) => str.replaceAll(__project, ''),
          env,
        },
        'node',
        '--import',
        'tsx',
        path.join(cwd, 'services', name),
        createServicePortOpt(name, port),
        gatewayPort && createPortOpt(gatewayPort),
        ...(services?.map(({ name, port }) =>
          createServicePortOpt(name, port),
        ) || []),
        ...args,
      );
      const service: Service = {
        ...proc,
        name,
        port,
        protocol,
      };
      await Promise.race([
        waitForExit
          .then(() => {
            throw new Error(
              `Service "${name}" exited successfully, but shouldn't have\n${proc.getStd('both')}`,
            );
          })
          // stop reachability wait after exit
          .finally(() => ctrl.abort()),
        waitForReachable(
          service,
          AbortSignal.any([ctrl.signal, cancelledSignal]),
        ),
      ]);
      return service;
    },
    async container({
      name,
      image,
      env = {},
      containerPort,
      hostPort,
      additionalContainerPorts: containerAdditionalPorts,
      healthcheck,
      pipeLogs = isDebug() || getEnvBool('E2E_PIPE_LOGS')
        ? `${name}.out`
        : false,
      cmd = [],
      volumes = [],
      args = [],
      protocol = 'http',
    }) {
      const containerName = `${name}_${Math.random().toString(32).slice(2)}`;

      if (!hostPort) {
        hostPort = await getAvailablePort();
      }

      const additionalPorts: Record<number, number> = {};
      if (containerAdditionalPorts) {
        for (const port of containerAdditionalPorts) {
          if (port === containerPort) {
            throw new Error(
              `Additional port ${port} is already specified as the "containerPort", please use a different port or remove it from "additionalPorts"`,
            );
          }
          additionalPorts[port] = await getAvailablePort();
        }
      }

      function msToNs(ms: number): number {
        return ms * 1000000;
      }

      const bakedImage = await fs
        .readFile(path.join(__project, 'docker-bake.hcl'))
        .then((c) => c.includes(`"${image}"`))
        .catch(() => false);

      const ctrl = new AbortController();
      const signal = AbortSignal.any(
        [ctrl.signal, cancelledSignal]
          // we filter because cancelledSignal is not present in jest
          .filter(Boolean),
      );

      if (!bakedImage) {
        // pull image if it doesnt exist and wait for finish
        const exists = await docker
          .getImage(image)
          .get()
          .then(() => true)
          .catch(() => false);
        if (!exists) {
          const imageStream = await docker.pull(image);

          if (
            'destroy' in imageStream &&
            typeof imageStream.destroy === 'function'
          ) {
            leftoverStack.defer(() => {
              (imageStream.destroy as VoidFunction)();
            });
            signal.addEventListener(
              'abort',
              () => {
                (imageStream.destroy as VoidFunction)();
              },
              { once: true },
            );
          }
          await new Promise((resolve, reject) => {
            docker.modem.followProgress(
              imageStream,
              (err, res) => (err ? reject(err) : resolve(res)),
              pipeLogs
                ? (e) => {
                    process.stderr.write(JSON.stringify(e));
                  }
                : undefined,
            );
          });
        } else {
          pipeLog({ cwd, pipeLogs }, `Image "${image}" exists, pull skipped`);
        }
      }

      const ctr = await docker.createContainer({
        name: containerName,
        Image: image,
        Env: Object.entries({
          ...process.env,
          ...env,
        }).map(([name, value]) => `${name}=${value}`),
        ExposedPorts: {
          [containerPort + '/tcp']: {},
          ...Object.keys(additionalPorts).reduce(
            (acc, containerPort) => ({
              ...acc,
              [containerPort + '/tcp']: {},
            }),
            {},
          ),
        },
        Cmd: [...cmd, ...args].filter(Boolean).map(String),
        HostConfig: {
          AutoRemove: true,
          PortBindings: {
            [containerPort + '/tcp']: [{ HostPort: hostPort.toString() }],
            ...Object.entries(additionalPorts).reduce(
              (acc, [containerPort, hostPort]) => ({
                ...acc,
                [containerPort + '/tcp']: [{ HostPort: hostPort.toString() }],
              }),
              {},
            ),
          },
          Binds: Object.values(volumes).map(
            ({ host, container }) => `${path.resolve(cwd, host)}:${container}`,
          ),
        },
        Healthcheck:
          healthcheck.length > 0
            ? {
                Test: healthcheck,
                Interval: msToNs(interval),
                Timeout: 0, // dont wait between tests
                Retries: retries,
              }
            : undefined,
        abortSignal: signal,
      });

      let stdboth = '';
      const stream = await ctr.attach({
        stream: true,
        stdout: true,
        stderr: true,
        abortSignal: signal,
      });
      stream.on('data', (data) => {
        stdboth += data.toString();
        pipeLog({ cwd, pipeLogs }, data);
      });

      await ctr.start();

      const container: Container = {
        kill() {
          throw new Error('Cannot send signals to containers.');
        },
        waitForExit: ctr.wait(),
        containerName,
        name,
        port: hostPort,
        protocol,
        additionalPorts,
        getStd() {
          // TODO: distinguish stdout and stderr
          return stdboth;
        },
        getStats() {
          throw new Error('Cannot get stats of a container.');
        },
        async [DisposableSymbols.asyncDispose]() {
          if (signal.aborted) {
            // noop if already disposed
            return;
          }
          ctrl.abort();
          await ctr.stop({ t: 0, signal: 'SIGTERM' });
        },
      };

      // verify that the container has started
      let startCheckRetries = 3;
      while (startCheckRetries) {
        await setTimeout(interval);
        try {
          await ctr.inspect({ abortSignal: signal });
          break;
        } catch (err) {
          // we dont use the err.statusCode because it doesnt work in CI, why? no clue
          if (/no such container/i.test(String(err))) {
            if (!--startCheckRetries) {
              throw new DockerError('Container did not start', container, err);
            }
            continue;
          }
          throw new DockerError(String(err), container, err);
        }
      }

      // we add the container to the stack only if it started
      leftoverStack.use(container);

      // wait for healthy
      if (healthcheck.length > 0) {
        while (!signal.aborted) {
          let status = '';
          try {
            const {
              State: { Health },
            } = await ctr.inspect({ abortSignal: signal });
            status = Health?.Status ? String(Health?.Status) : '';
          } catch (err) {
            if (/no such container/i.test(String(err))) {
              ctrl.abort(); // container died so no need to dispose of it (see async dispose implementation)
              throw new DockerError('Container died', container, err);
            }
            throw new DockerError(String(err), container, err);
          }

          if (status === 'none') {
            await container[DisposableSymbols.asyncDispose]();
            throw new DockerError(
              'Container has "none" health status, but has a healthcheck',
              container,
              null,
            );
          } else if (status === 'unhealthy') {
            await container[DisposableSymbols.asyncDispose]();
            throw new DockerError('Container is unhealthy', container, null);
          } else if (status === 'healthy') {
            break;
          } else if (status === 'starting') {
            await setTimeout(interval);
          } else {
            throw new DockerError(
              `Unknown health status "${status}"`,
              container,
              null,
            );
          }
        }
      } else {
        await waitForReachable(container, signal);
      }
      return container;
    },
    async composeWithApollo({
      services = [],
      pipeLogs = isDebug() || getEnvBool('E2E_PIPE_LOGS') ? 'rover.out' : false,
      maskServicePorts,
      trimHostPaths,
    }) {
      const subgraphs: ServiceEndpointDefinition[] = [];
      for (const service of services) {
        const hostname = await getLocalhost(service.port, service.protocol);
        subgraphs.push({
          name: service.name,
          url: `${hostname}:${service.port}/graphql`,
        });
      }

      let stderr = '';
      let stdout = '';
      let stdboth = '';

      let supergraphSdl: string;
      const introspectAndCompose = new IntrospectAndCompose({
        subgraphs,
        logger: {
          debug(msg) {
            if (isDebug()) {
              const line = inspect(msg) + '\n';
              stdout += line;
              stdboth += line;
              if (pipeLogs) {
                process.stdout.write(line);
              }
            }
          },
          error(msg) {
            const line = inspect(msg) + '\n';
            stderr += line;
            stdboth += line;
            if (pipeLogs) {
              process.stderr.write(line);
            }
          },
          info(msg) {
            const line = inspect(msg) + '\n';
            stdout += line;
            stdboth += line;
            if (pipeLogs) {
              process.stdout.write(line);
            }
          },
          warn(msg) {
            const line = inspect(msg) + '\n';
            stdout += line;
            stdboth += line;
            if (pipeLogs) {
              process.stdout.write(line);
            }
          },
        },
      });
      const supergraphFile = await tenv.fs.tempfile('supergraph.graphql');
      function onSupergraphSdl() {
        supergraphSdl = applyMaskServicePorts(supergraphSdl, {
          maskServicePorts,
          trimHostPaths,
          services,
        });
        return tenv.fs.write(supergraphFile, supergraphSdl);
      }
      const initialized = await introspectAndCompose.initialize({
        getDataSource(opts) {
          return new RemoteGraphQLDataSource(opts);
        },
        update(newSupergraphSdl) {
          supergraphSdl = newSupergraphSdl;
          return onSupergraphSdl();
        },
        healthCheck: () => fakePromise(undefined),
      });
      supergraphSdl = initialized.supergraphSdl;
      await onSupergraphSdl();

      return {
        output: supergraphFile,
        get result() {
          return supergraphSdl;
        },
        getStats() {
          throw new Error('Cannot get stats of a compose.');
        },
        waitForExit: fakePromise(),
        kill: () => initialized.cleanup(),
        getStd(std) {
          switch (std) {
            case 'out':
              return stdout;
            case 'err':
              return stderr;
            case 'both':
              return stdboth;
            default:
              throw new Error(`Unknown std "${std}"`);
          }
        },
        [DisposableSymbols.asyncDispose]: () => initialized.cleanup(),
      };
    },
  };
  return tenv;
}

export function getAvailablePort(): Promise<number> {
  const deferred = createDeferred<number>();
  const server = createServer();
  server.once('error', (err) => deferred.reject(err));
  server.listen(0, () => {
    try {
      const addressInfo = server.address() as AddressInfo;
      server.close((err) => {
        if (err) {
          return deferred.reject(err);
        }

        return deferred.resolve(addressInfo.port);
      });
    } catch (err) {
      return deferred.reject(err);
    }
  });
  return deferred.promise;
}

function waitForReachable(server: Server | Container, signal: AbortSignal) {
  const ports = [server.port];
  if ('additionalPorts' in server) {
    ports.push(...Object.values(server.additionalPorts));
  }
  return Promise.all(
    ports.map((port) =>
      waitForPort({ port, signal, protocol: server.protocol, interval }),
    ),
  );
}

class DockerError extends Error {
  constructor(
    public override message: string,
    container: Container,
    cause: unknown,
  ) {
    super();
    this.name = 'DockerError';
    this.message = message + '\n' + container.getStd('both');
    this.cause = cause;
  }
}

/** Maybe pipes the log entry to the stderr of the current process, or appends it to a file relative to the {@link cwd} - if {@link pipeLogs} is a `string`. */
function pipeLog(
  { cwd, pipeLogs }: { cwd: string; pipeLogs: boolean | string },
  log: string,
) {
  if (pipeLogs === true) {
    process.stderr.write(log);
  } else if (typeof pipeLogs === 'string') {
    fs.appendFile(path.join(cwd, pipeLogs), log);
  }
}

function applyMaskServicePorts(
  result: string,
  {
    services,
    trimHostPaths,
    maskServicePorts,
  }: {
    services?: Service[];
    trimHostPaths?: boolean;
    maskServicePorts?: boolean;
  },
) {
  if (trimHostPaths || maskServicePorts) {
    if (trimHostPaths) {
      result = result.replaceAll(__project, '');
    }
    if (services) {
      for (const subgraph of services) {
        if (maskServicePorts) {
          result = result.replaceAll(
            subgraph.port.toString(),
            `<${subgraph.name}_port>`,
          );
        }
      }
    }
  }
  return result;
}
