import childProcess from 'child_process';
import fs from 'fs/promises';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path, { isAbsolute } from 'path';
import { setTimeout } from 'timers/promises';
import {
  IntrospectAndCompose,
  RemoteGraphQLDataSource,
  type ServiceEndpointDefinition,
} from '@apollo/gateway';
import { createDeferred } from '@graphql-tools/delegate';
import {
  boolEnv,
  createOpt,
  createPortOpt,
  createServicePortOpt,
  hostnames,
  isDebug,
} from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { fetch } from '@whatwg-node/fetch';
import Dockerode from 'dockerode';
import { glob } from 'glob';
import type { ExecutionResult } from 'graphql';
import terminate from 'terminate/promise';
import { leftoverStack } from './leftoverStack';
import { interval, retries } from './timeout';
import { trimError } from './trimError';

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
    throw new Error(`Unsupported E2E gateway runner "${runner}"`);
  }
  if (runner === 'docker' && !boolEnv('CI')) {
    process.stderr.write(`
⚠️ Using docker gateway runner! Make sure you have built the containers with:
E2E_GATEWAY_RUNNER=docker yarn build && yarn workspace @graphql-hive/gateway bundle && docker buildx bake e2e

`);
  }
  if (runner === 'bin' && !boolEnv('CI')) {
    process.stderr.write(`
⚠️ Using bin gateway runner! Make sure you have built the binary with:
yarn build && yarn workspace @graphql-hive/gateway bundle && yarn workspace @graphql-hive/gateway tsx scripts/package-binary

`);
  }
  if (runner === 'docker' && !boolEnv('CI')) {
    process.stderr.write(`
⚠️ Using docker gateway runner! Make sure you have built the containers with:
E2E_GATEWAY_RUNNER=bun-docker yarn build && yarn workspace @graphql-hive/gateway bundle && docker buildx bake e2e_bun

`);
  }
  return runner as ServeRunner;
})();

export interface ProcOptions {
  /**
   * Pipe the logs from the spawned process to the current process, or to a file
   * relative to the Tenv cwd when passing a string.
   *
   * Useful for debugging.
   *
   * @default boolEnv('DEBUG')
   */
  pipeLogs?: boolean | string;
  /**
   * Additional environment variables to pass to the spawned process.
   *
   * They will be merged with `process.env` overriding any existing value.
   */
  env?: Record<string, string | number>;
  /** Extra args to pass to the process. */
  args?: (string | number | boolean)[];
}

export interface Proc extends AsyncDisposable {
  getStd(o: 'out' | 'err' | 'both'): string;
  getStats(): Promise<{
    // Total CPU utilization (of all cores) as a percentage.
    cpu: number;
    // Memory consumption in megabytes (MB).
    mem: number;
  }>;
}

export interface Server extends Proc {
  port: number;
}

export interface ServeOptions extends ProcOptions {
  port?: number;
  /**
   * Path to the supergraph file or {@link ComposeOptions} which will be used for composition with GraphQL Mesh.
   * If {@link ComposeOptions} is provided, its {@link ComposeOptions.output output} will always be set to `graphql`;
   */
  supergraph?:
    | string
    | {
        with: 'mesh';
        services?: Service[];
      }
    | {
        with: 'apollo';
        services: Service[];
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
}

export interface Gateway extends Server {
  execute(args: {
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
    headers?: Record<string, string>;
  }): Promise<ExecutionResult<any>>;
}

export interface ServiceOptions extends ProcOptions {
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
}

export interface Service extends Server {
  name: string;
}

export interface ComposeOptions extends ProcOptions {
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
  gateway(opts?: ServeOptions): Promise<Gateway>;
  /**
   * Starts a service by name. Services are services that serve data, not necessarily GraphQL.
   * The TypeScript service executable must be at `services/<name>.ts` or `services/<name>/index.ts`.
   * Port will be provided as an argument `--<name>_port=<port>` to the service.
   */
  service(name: string, opts?: ServiceOptions): Promise<Service>;
  container(opts: ContainerOptions): Promise<Container>;
  composeWithMesh(opts?: ComposeOptions): Promise<Compose>;
  composeWithApollo(services: Service[]): Promise<string>;
}

async function handleDockerHostName(
  supergraph: string,
  volumes: {
    host: string;
    container: string;
  }[],
) {
  // docker for linux (which is used in the CI) will have the host be on 172.17.0.1,
  // and locally the host.docker.internal (or just on macos?) should just work
  const dockerLocalHost = boolEnv('CI') ? '172.17.0.1' : 'host.docker.internal';
  // we need to replace all local servers in the supergraph to use docker's local hostname.
  // without this, the services running on the host wont be accessible by the docker container
  if (/^http(s?):\/\//.test(supergraph)) {
    // supergraph is a url
    supergraph = supergraph
      .replaceAll('0.0.0.0', dockerLocalHost)
      .replaceAll('localhost', dockerLocalHost)
      .replaceAll('127.0.0.1', dockerLocalHost);
  } else {
    // supergraph is a path
    await fs.writeFile(
      supergraph,
      (await fs.readFile(supergraph, 'utf8'))
        .replaceAll('0.0.0.0', dockerLocalHost)
        .replaceAll('localhost', dockerLocalHost)
        .replaceAll('127.0.0.1', dockerLocalHost),
    );
    volumes.push({
      host: supergraph,
      container: `/gateway/${path.basename(supergraph)}`,
    });
    supergraph = path.basename(supergraph);
  }
  return supergraph;
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
    spawn(command, { args: extraArgs = [], ...opts } = {}) {
      const [cmd, ...args] = Array.isArray(command)
        ? command
        : command.split(' ');
      return spawn({ ...opts, cwd }, String(cmd), ...args, ...extraArgs);
    },
    gatewayRunner,
    async gateway(opts) {
      let {
        port = await getAvailablePort(),
        supergraph: supergraphOpt,
        subgraph: subgraphOpt,
        pipeLogs = isDebug(),
        env,
        runner,
        args = [],
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
        });
        supergraph = output;
      } else if (supergraphOpt?.with === 'apollo') {
        const output = await tenv.composeWithApollo(supergraphOpt.services);
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

      if (gatewayRunner === 'docker' || gatewayRunner === 'bun-docker') {
        const volumes: ContainerOptions['volumes'] =
          runner?.docker?.volumes || [];

        if (supergraph) {
          supergraph = await handleDockerHostName(supergraph, volumes);
        }
        if (subgraph) {
          subgraph = await handleDockerHostName(subgraph, volumes);
        }

        for (const configfile of await glob('gateway.config.*', { cwd })) {
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
            `wget --spider http://0.0.0.0:${port}/healthcheck`,
          ],
          cmd: [
            createPortOpt(port),
            ...(supergraph ? ['supergraph', supergraph] : []),
            ...(subgraph ? ['subgraph', subgraph] : []),
            ...args,
          ],
          volumes,
          pipeLogs,
        });
        proc = cont;
      } else if (gatewayRunner === 'bun') {
        [proc, waitForExit] = await spawn(
          { env, cwd, pipeLogs },
          'npx',
          'bun',
          path.resolve(__project, 'packages', 'gateway', 'src', 'bin.ts'),
          ...(supergraph ? ['supergraph', supergraph] : []),
          ...(subgraph ? ['subgraph', subgraph] : []),
          ...args,
          createPortOpt(port),
        );
      } /* if (gatewayRunner === 'node') */ else {
        [proc, waitForExit] = await spawn(
          { env, cwd, pipeLogs },
          'node',
          '--import',
          'tsx',
          path.resolve(__project, 'packages', 'gateway', 'src', 'bin.ts'),
          ...(supergraph ? ['supergraph', supergraph] : []),
          ...(subgraph ? ['subgraph', subgraph] : []),
          ...args,
          createPortOpt(port),
        );
      }

      const gw: Gateway = {
        ...proc,
        port,
        async execute({ headers, ...args }) {
          const res = await fetch(`http://0.0.0.0:${port}/graphql`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/graphql-response+json, application/json',
              ...headers,
            },
            body: JSON.stringify(args),
          });
          if (!res.ok) {
            const err = new Error(
              `${res.status} ${res.statusText}\n${await res.text()}`,
            );
            err.name = 'ResponseError';
            throw err;
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
        waitForReachable(gw, ctrl.signal),
      ]);
      return gw;
    },
    async composeWithMesh(opts) {
      const {
        services = [],
        trimHostPaths,
        maskServicePorts,
        pipeLogs = isDebug(),
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
        { cwd, pipeLogs, env },
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

      if (trimHostPaths || maskServicePorts) {
        if (trimHostPaths) {
          result = result.replaceAll(__project, '');
        }
        for (const subgraph of services) {
          if (maskServicePorts) {
            result = result.replaceAll(
              subgraph.port.toString(),
              `<${subgraph.name}_port>`,
            );
          }
        }
        if (output) {
          await fs.writeFile(output, result, 'utf8');
        }
      }

      return { ...proc, output, result };
    },
    async service(
      name,
      { port, gatewayPort, pipeLogs = isDebug(), args = [] } = {},
    ) {
      port ||= await getAvailablePort();
      const ctrl = new AbortController();
      const [proc, waitForExit] = await spawn(
        { cwd, pipeLogs, signal: ctrl.signal },
        'node',
        '--import',
        'tsx',
        path.join(cwd, 'services', name),
        createServicePortOpt(name, port),
        gatewayPort && createPortOpt(gatewayPort),
        ...args,
      );
      const service: Service = { ...proc, name, port };
      await Promise.race([
        waitForExit
          .then(() => {
            throw new Error(
              `Service "${name}" exited successfully, but shouldn't have\n${proc.getStd('both')}`,
            );
          })
          // stop reachability wait after exit
          .finally(() => ctrl.abort()),
        waitForReachable(service, ctrl.signal),
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
      pipeLogs = boolEnv('DEBUG'),
      cmd = [],
      volumes = [],
      args = [],
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

      if (!bakedImage) {
        // pull image if it doesnt exist and wait for finish
        const exists = await docker
          .getImage(image)
          .get()
          .then(() => true)
          .catch(() => false);
        if (!exists) {
          const imageStream = await docker.pull(image);
          leftoverStack.defer(() => {
            if (
              'destroy' in imageStream &&
              typeof imageStream.destroy === 'function'
            ) {
              imageStream.destroy();
            }
          });
          ctrl.signal.addEventListener('abort', () => {
            if (
              'destroy' in imageStream &&
              typeof imageStream.destroy === 'function'
            ) {
              imageStream.destroy(ctrl.signal.reason);
            }
          });
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
        Env: Object.entries(env).map(([name, value]) => `${name}=${value}`),
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
        abortSignal: ctrl.signal,
      });

      let stdboth = '';
      const stream = await ctr.attach({
        stream: true,
        stdout: true,
        stderr: true,
        abortSignal: ctrl.signal,
      });
      stream.on('data', (data) => {
        stdboth += data.toString();
        pipeLog({ cwd, pipeLogs }, data);
      });

      await ctr.start();

      const container: Container = {
        containerName,
        name,
        port: hostPort,
        additionalPorts,
        getStd() {
          // TODO: distinguish stdout and stderr
          return stdboth;
        },
        getStats() {
          throw new Error('Cannot get stats of a container.');
        },
        [DisposableSymbols.asyncDispose]() {
          if (ctrl.signal.aborted) {
            // noop if already disposed
            return undefined as unknown as Promise<void>;
          }
          ctrl.abort();
          return ctr.stop({ t: 0, signal: 'SIGTERM' });
        },
      };
      leftoverStack.use(container);

      // verify that the container has started
      await setTimeout(interval);
      try {
        await ctr.inspect();
      } catch (err) {
        if (Object(err).statusCode === 404) {
          throw new DockerError('Container was not started', container);
        }
        throw err;
      }

      // wait for healthy
      if (healthcheck.length > 0) {
        while (!ctrl.signal.aborted) {
          let status = '';
          try {
            const {
              State: { Health },
            } = await ctr.inspect({ abortSignal: ctrl.signal });
            status = Health?.Status ? String(Health?.Status) : '';
          } catch (err) {
            if (Object(err).statusCode === 404) {
              throw new DockerError('Container was not started', container);
            }
            throw err;
          }

          if (status === 'none') {
            await container[DisposableSymbols.asyncDispose]();
            throw new DockerError(
              'Container has "none" health status, but has a healthcheck',
              container,
            );
          } else if (status === 'unhealthy') {
            await container[DisposableSymbols.asyncDispose]();
            throw new DockerError('Container is unhealthy', container);
          } else if (status === 'healthy') {
            break;
          } else if (status === 'starting') {
            await setTimeout(interval);
          } else {
            throw new DockerError(
              `Unknown health status "${status}"`,
              container,
            );
          }
        }
      } else {
        await waitForReachable(container, ctrl.signal);
      }
      return container;
    },
    async composeWithApollo(services) {
      const subgraphs: ServiceEndpointDefinition[] = [];
      for (const service of services) {
        subgraphs.push({
          name: service.name,
          url: `http://0.0.0.0:${service.port}/graphql`,
        });
      }

      const { supergraphSdl } = await new IntrospectAndCompose({
        subgraphs,
      }).initialize({
        getDataSource(opts) {
          return new RemoteGraphQLDataSource(opts);
        },
        update() {},
        async healthCheck() {},
      });

      const supergraphFile = await tenv.fs.tempfile('supergraph.graphql');
      await tenv.fs.write(supergraphFile, supergraphSdl);
      return supergraphFile;
    },
  };
  return tenv;
}

interface SpawnOptions extends ProcOptions {
  cwd: string;
  shell?: boolean;
  signal?: AbortSignal;
}

function spawn(
  { cwd, pipeLogs = isDebug(), env = {}, shell, signal }: SpawnOptions,
  cmd: string,
  ...args: (string | number | boolean | null | undefined)[]
): Promise<[proc: Proc, waitForExit: Promise<void>]> {
  const child = childProcess.spawn(cmd, args.filter(Boolean).map(String), {
    cwd,
    // ignore stdin, pipe stdout and stderr
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.entries(env).reduce(
      (acc, [key, val]) => ({ ...acc, [key]: String(val) }),
      process.env,
    ),
    shell,
    signal,
  });

  const exitDeferred = createDeferred<void>();
  const waitForExit = exitDeferred.promise;
  let stdout = '';
  let stderr = '';
  let stdboth = '';
  const proc: Proc = {
    getStd(o) {
      switch (o) {
        case 'out':
          return stdout;
        case 'err':
          return stderr;
        case 'both':
          return stdboth;
      }
    },
    async getStats() {
      const [proc, waitForExit] = await spawn(
        { cwd, pipeLogs: isDebug() },
        'ps',
        '-o',
        'pcpu=,rss=',
        '-p',
        child.pid!,
      );
      await waitForExit;
      const [cpu, mem] = proc.getStd('out').trim().split(/\s+/);
      return {
        cpu: parseFloat(cpu!),
        mem: parseFloat(mem!) * 0.001, // KB to MB
      };
    },
    [DisposableSymbols.asyncDispose]: () => {
      const childPid = child.pid;
      if (childPid && child.exitCode == null) {
        return terminate(childPid);
      }
      return waitForExit;
    },
  };
  leftoverStack.use(proc);

  child.stdout.on('data', (x) => {
    const str = x.toString();
    stdout += str;
    stdboth += str;
    pipeLog({ cwd, pipeLogs }, x);
  });
  child.stderr.on('data', (x) => {
    // prefer relative paths for logs consistency
    const str = x.toString().replaceAll(__project, '');
    stderr += str;
    stdboth += str;
    pipeLog({ cwd, pipeLogs }, x);
  });

  child.once('exit', () => {
    // process ended
    child.stdout.destroy();
    child.stderr.destroy();
  });
  child.once('close', (code) => {
    // process ended _and_ the stdio streams have been closed
    if (code) {
      exitDeferred.reject(
        new Error(`Exit code ${code}\n${trimError(stdboth)}`),
      );
    } else {
      exitDeferred.resolve();
    }
  });

  return new Promise((resolve, reject) => {
    child.once('error', (err) => {
      exitDeferred.reject(err); // reject waitForExit promise
      reject(err);
    });
    child.once('spawn', () => resolve([proc, waitForExit]));
  });
}

export function getAvailablePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    try {
      server.listen(0, () => {
        try {
          const addressInfo = server.address() as AddressInfo;
          resolve(addressInfo.port);
          server.close();
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function waitForPort(port: number, signal: AbortSignal) {
  outer: while (!signal.aborted) {
    for (const localHostname of hostnames) {
      try {
        await fetch(`http://${localHostname}:${port}`, { signal });
        break outer;
      } catch (err) {}
    }
    // no need to track retries, jest will time out aborting the signal
    signal.throwIfAborted();
    await setTimeout(interval);
  }
}

function waitForReachable(server: Server | Container, signal: AbortSignal) {
  const ports = [server.port];
  if ('additionalPorts' in server) {
    ports.push(...Object.values(server.additionalPorts));
  }
  return Promise.all(ports.map((port) => waitForPort(port, signal)));
}

class DockerError extends Error {
  constructor(
    public override message: string,
    container: Container,
  ) {
    super();
    this.name = 'DockerError';
    this.message = message + '\n' + container.getStd('both');
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
