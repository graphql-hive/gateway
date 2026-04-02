import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { GatewayPlugin, Logger } from '@graphql-hive/gateway-runtime';
import type { LangfuseClientParams } from '@langfuse/client';
import type { GraphQLSchema } from 'graphql';
import { isAsyncIterable, type FetchAPI } from 'graphql-yoga';
import {
  resolveDescriptions,
  resolveFieldDescriptions,
  resolveProviders,
  type DescriptionProvider,
  type DescriptionProviderConfig,
  type DescriptionProviderContext,
  type ProviderRegistry,
} from './description-provider.js';
import { createHiveLoader, type HiveLoader } from './hive-loader.js';
import {
  loadOperationsFromString,
  resolveOperation,
  type ParsedOperation,
} from './operation-loader.js';
import {
  dealiasArgs,
  formatToolCallResult,
  handleMCPRequest,
  processExecutionResult,
  type JsonRpcRequest,
  type MCPHandlerOptions,
} from './protocol.js';
import type { LangfuseGetPromptOptions } from './providers/langfuse.js';
import { ToolRegistry, type RegisteredTool } from './registry.js';
import type { PluginContext } from './types.js';

type Prettify<T> = { [K in keyof T]: T[K] } & {};

interface MCPToolCallContext {
  jsonrpcId: number | string;
  toolName: string;
  args: Record<string, unknown>;
  tool: RegisteredTool;
  headers: Record<string, string>;
}

/** Defines how a tool's GraphQL operation is sourced, either inline or by reference to a named operation. */
export interface MCPToolSource {
  /** Source type: 'inline' for a query string, 'graphql' for a named operation reference */
  type: string;
  /** The GraphQL operation source (required when type is 'inline') */
  query?: string;
  /** Name of the operation to resolve (required when type is 'graphql') */
  operationName?: string;
  /** Whether the operation is a query or mutation (required when type is 'graphql') */
  operationType?: string;
  /** Optional path to a .graphql file containing the operation (overrides operationsPath) */
  file?: string;
}

/** Behavioral hints for MCP clients about a tool's characteristics. */
export interface MCPToolAnnotations {
  /** If true, the tool does not modify its environment and is safe to call with any arguments. Clients assume false when omitted */
  readOnlyHint?: boolean;
  /** If true, the tool may perform destructive updates; if false, only additive. Only meaningful when readOnlyHint is false. Clients assume true when omitted */
  destructiveHint?: boolean;
  /** If true, calling repeatedly with the same arguments has no additional effect. Only meaningful when readOnlyHint is false. Clients assume false when omitted */
  idempotentHint?: boolean;
  /** If true, the tool may interact with an "open world" of external entities; if false, its domain of interaction is closed. Clients assume true when omitted */
  openWorldHint?: boolean;
}

/** Icon metadata for tools, resources, or the server itself. */
export interface MCPIcon {
  /** Standard URI pointing to the icon resource (HTTP/HTTPS URL or data: URI with base64-encoded image) */
  src: string;
  /** MIME type override (e.g. "image/png", "image/svg+xml") */
  mimeType?: string;
  /** Sizes at which the icon can be used in WxH format (e.g. ["48x48", "96x96"] or ["any"] for scalable) */
  sizes?: string[];
  /** Design context: "light" or "dark" background. If omitted, icon works with any theme */
  theme?: string;
}

/** Tool execution capability flags per the MCP spec. */
export interface MCPToolExecution {
  /** Whether this tool supports task-augmented execution (default: "forbidden") */
  taskSupport?: 'forbidden' | 'optional' | 'required';
}

/** Optional metadata overrides for a tool (description, title, annotations, icons, provider). */
export interface MCPToolOverrides {
  /** Display title override */
  title?: string;
  /** Description override (takes precedence over directive and schema descriptions) */
  description?: string;
  /** Behavioral hints for clients */
  annotations?: MCPToolAnnotations;
  /** Icon URLs for client UIs */
  icons?: MCPIcon[];
  /** Task support configuration */
  execution?: MCPToolExecution;
  /** Opaque metadata passed through to clients */
  _meta?: Record<string, unknown>;
  /** Dynamic description provider config (e.g. Langfuse prompt). Takes highest precedence */
  descriptionProvider?:
    | {
        /** Provider type identifier */
        type: 'langfuse';
        /** Langfuse prompt name to fetch */
        prompt: string;
        /** Specific prompt version to use (omit for latest) */
        version?: number;
        /** Additional Langfuse getPrompt() options (e.g. label, cacheTtlSeconds) */
        options?: LangfuseGetPromptOptions;
      }
    | DescriptionProviderConfig;
}

/** Per-field overrides for a tool's input schema (descriptions, examples, defaults, aliases). */
export interface MCPInputOverrides {
  /** JSON Schema overrides keyed by GraphQL variable name */
  schema?: {
    /** Per-variable overrides */
    properties?: Record<
      string,
      {
        /** Override the variable's description in the input schema */
        description?: string;
        /** Example values for the variable */
        examples?: unknown[];
        /** Default value for the variable */
        default?: unknown;
        /** Rename the variable in the MCP input schema (original name used internally for GraphQL) */
        alias?: string;
        /** Dynamic description provider config for this specific field */
        descriptionProvider?: DescriptionProviderConfig;
      }
    >;
  };
}

/** MCP annotation fields shared by content items and resources. */
export interface MCPAnnotations {
  /** Intended audience: "user", "assistant", or both */
  audience?: Array<'user' | 'assistant'>;
  /** Importance from 0.0 (least important, optional) to 1.0 (most important, effectively required) */
  priority?: number;
  /** ISO 8601 timestamp of last modification (e.g. "2025-01-12T15:00:58Z") */
  lastModified?: string;
}

/** Annotations for content items in tool responses. */
export type MCPContentAnnotations = MCPAnnotations;
/** Annotations for resource entries. */
export type MCPResourceAnnotations = MCPAnnotations;

interface MCPResourceConfigBase {
  /** Display name for the resource */
  name: string;
  /** Unique URI identifying this resource */
  uri: string;
  /** Optional display title */
  title?: string;
  /** Human-readable description */
  description?: string;
  /** MIME type (default: "text/plain") */
  mimeType?: string;
  /** Icon URLs for client UIs */
  icons?: MCPIcon[];
  /** Resource-level annotations (audience, priority) */
  annotations?: MCPResourceAnnotations;
  /** Dynamic description provider config */
  descriptionProvider?: DescriptionProviderConfig;
}

/**
 * Configuration for a static MCP resource. Exactly one content source must be provided:
 * `text` (inline string), `file` (path to read at startup), or `blob` (inline base64).
 */
export type MCPResourceConfig = MCPResourceConfigBase &
  (
    | {
        /** Inline text content */
        text: string;
        file?: never;
        blob?: never;
      }
    | {
        /** Path to a file to read at startup */
        file: string;
        text?: never;
        blob?: never;
        /** If true, read as binary (base64). If false, read as UTF-8 text. Defaults to auto-detect from mimeType */
        binary?: boolean;
      }
    | {
        /** Inline base64-encoded binary content */
        blob: string;
        text?: never;
        file?: never;
      }
  );

/** Immutable resolved form of a resource after startup processing (file reading, base64 validation). */
export interface ResolvedResource {
  /** Display name for the resource */
  readonly name: string;
  /** Unique URI identifying this resource */
  readonly uri: string;
  /** Optional display title */
  readonly title?: string;
  /** Human-readable description */
  readonly description?: string;
  /** Resolved MIME type */
  readonly mimeType: string;
  /** Content size in bytes */
  readonly size: number;
  /** Icon URLs for client UIs */
  readonly icons?: MCPIcon[];
  /** Resource-level annotations */
  readonly annotations?: MCPResourceAnnotations;
  /** Text content (mutually exclusive with blob) */
  readonly text?: string;
  /** Base64-encoded binary content (mutually exclusive with text) */
  readonly blob?: string;
  /** Dynamic description provider config */
  readonly descriptionProvider?: DescriptionProviderConfig;
}

/** Return type for resource template handlers. Must provide either `text` or `blob` content. */
export type ResourceTemplateResult =
  | {
      /** Text content returned by the handler */
      text: string;
      blob?: never;
      /** MIME type override for this response */
      mimeType?: string;
    }
  | {
      /** Base64-encoded binary content returned by the handler */
      blob: string;
      text?: never;
      /** MIME type override for this response */
      mimeType?: string;
    };

/** Configuration for a dynamic MCP resource template with a URI pattern and handler function. */
export interface MCPResourceTemplateConfig {
  /** URI template with `{param}` placeholders (e.g. "file://project/{path}") */
  uriTemplate: string;
  /** Display name for the template */
  name: string;
  /** Optional display title */
  title?: string;
  /** Human-readable description */
  description?: string;
  /** Default MIME type for resolved resources (default: "text/plain") */
  mimeType?: string;
  /** Icon URLs for client UIs */
  icons?: MCPIcon[];
  /** Resource-level annotations */
  annotations?: MCPResourceAnnotations;
  /** Dynamic description provider config */
  descriptionProvider?: DescriptionProviderConfig;
  /** Handler function called with extracted URI parameters to produce resource content */
  handler: (
    params: Record<string, string>,
  ) => ResourceTemplateResult | Promise<ResourceTemplateResult>;
}

/** Immutable resolved form of a resource template with compiled URI pattern. */
export interface ResolvedResourceTemplate {
  /** Original URI template string */
  readonly uriTemplate: string;
  /** Display name for the template */
  readonly name: string;
  /** Optional display title */
  readonly title?: string;
  /** Human-readable description */
  readonly description?: string;
  /** Default MIME type for resolved resources */
  readonly mimeType?: string;
  /** Icon URLs for client UIs */
  readonly icons?: MCPIcon[];
  /** Resource-level annotations */
  readonly annotations?: MCPResourceAnnotations;
  /** Dynamic description provider config */
  readonly descriptionProvider?: DescriptionProviderConfig;
  /** Handler function called with extracted URI parameters */
  readonly handler: MCPResourceTemplateConfig['handler'];
  /** Compiled regex pattern from the URI template */
  readonly pattern: RegExp;
  /** Parameter names extracted from the URI template (in order) */
  readonly paramNames: string[];
}

const VALID_PARAM_NAME = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

export function compileUriTemplate(template: string): {
  pattern: RegExp;
  paramNames: string[];
} {
  // Validate balanced braces before processing
  const openCount = (template.match(/\{/g) || []).length;
  const closeCount = (template.match(/\}/g) || []).length;
  if (openCount !== closeCount) {
    throw new Error(
      `Unbalanced braces in URI template "${template}". Found ${openCount} opening and ${closeCount} closing braces.`,
    );
  }

  const paramNames: string[] = [];
  const escaped = template.replace(
    /\{([^}]+)\}|([^{]+)/g,
    (_match, param, literal) => {
      if (param) {
        if (!VALID_PARAM_NAME.test(param)) {
          throw new Error(
            `Invalid parameter name "{${param}}" in URI template "${template}". ` +
              `Parameter names must be valid identifiers (letters, digits, underscores).`,
          );
        }
        if (paramNames.includes(param)) {
          throw new Error(
            `Duplicate parameter name "{${param}}" in URI template "${template}". ` +
              `Each parameter name must be unique.`,
          );
        }
        paramNames.push(param);
        return `(?<${param}>[^/]+)`;
      }
      return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
  );
  return { pattern: new RegExp(`^${escaped}$`), paramNames };
}

/** Output extraction and schema configuration for a tool's GraphQL response. */
export interface MCPOutputOverrides {
  /** Dot-notation path to extract from the GraphQL response data, e.g. "search.items" */
  path?: string;
  /** Set to false to suppress outputSchema in tools/list */
  schema?: false;
  /** Annotations to attach to content items in tool responses (audience, priority) */
  contentAnnotations?: MCPContentAnnotations;
  /** Per-field description providers for output schema fields, keyed by dot-path (e.g. "forecast.conditions") */
  descriptionProviders?: Record<string, DescriptionProviderConfig>;
}

/** Context passed to preprocess/postprocess hooks with request metadata. */
export interface ToolHookContext {
  /** Name of the tool being executed */
  toolName: string;
  /** All HTTP headers from the incoming MCP request */
  headers: Record<string, string>;
  /** The GraphQL operation source for this tool */
  query: string;
}

/** Lifecycle hooks for intercepting or transforming tool execution. */
export interface MCPToolHooks {
  /**
   * Called before GraphQL execution. Receives de-aliased arguments
   * (original GraphQL variable names, not MCP alias names).
   * Return a non-undefined value to short-circuit execution and use that value as the tool result.
   * Return undefined (or void) to continue with normal GraphQL execution.
   * When preprocess short-circuits, postprocess is NOT called.
   *
   * To return a raw MCP result, return an object with a `content` array of MCP content items
   * (each with `type: "text" | "image" | "audio" | "resource" | "resource_link"`). This will be passed through directly
   * as the MCP response, allowing custom fields like `_meta` or `isError`.
   */
  preprocess?: (
    args: Record<string, unknown>,
    context: ToolHookContext,
  ) => unknown | Promise<unknown>;
  /**
   * Called after GraphQL execution (and output.path extraction) to transform the result.
   * Not called when preprocess short-circuits.
   * When a postprocess hook is registered, the response uses text content
   * instead of structuredContent since the hook may change the result shape.
   *
   * To return a raw MCP result, return an object with a `content` array of MCP content items
   * (each with `type: "text" | "image" | "audio" | "resource" | "resource_link"`). This will be passed through directly
   * as the MCP response, allowing custom fields like `_meta` or `isError`.
   */
  postprocess?: (
    result: unknown,
    args: Record<string, unknown>,
    context: ToolHookContext,
  ) => unknown | Promise<unknown>;
}

/** Configuration for a single MCP tool backed by a GraphQL operation. */
export interface MCPToolConfig {
  /** Unique tool name exposed to MCP clients */
  name: string;
  /** How to resolve the GraphQL operation (inline query or reference to a named operation) */
  source: MCPToolSource;
  /** Metadata overrides (description, title, annotations, icons, description provider) */
  tool?: MCPToolOverrides;
  /** Per-field input schema overrides (descriptions, examples, defaults, aliases) */
  input?: MCPInputOverrides;
  /** Output extraction and schema configuration */
  output?: MCPOutputOverrides;
  /** Pre/post-process hooks for intercepting or transforming tool execution */
  hooks?: MCPToolHooks;
}

/** Configuration for loading operations from a Hive App Deployment. */
export interface MCPHiveConfig {
  /** Hive registry access token */
  token: string;
  /** Target selector as "organizationSlug/projectSlug/targetSlug" */
  target: string;
  /** App deployment name to fetch operations from */
  appName: string;
  /** Specific app version (omit for latest active deployment) */
  appVersion?: string;
  /** Poll interval in ms (default: 60000) */
  pollIntervalMs?: number;
  /** Hive API endpoint override (default: "https://app.graphql-hive.com/graphql") */
  endpoint?: string;
}

/** Top-level configuration for the MCP plugin. Passed to {@link useMCP}. */
export interface MCPConfig {
  /** Logger instance */
  log?: Logger;
  /** Server name reported in `initialize` responses */
  name: string;
  /** Server version reported in `initialize` responses (default: "1.0.0") */
  version?: string;
  /** Human-readable server title */
  title?: string;
  /** Human-readable server description */
  description?: string;
  /** Server icons for client UIs */
  icons?: MCPIcon[];
  /** Server website URL */
  websiteUrl?: string;
  /** Free-text instructions included in `initialize` responses for LLM context */
  instructions?: string;
  /** MCP protocol version to advertise (default: "2025-11-25") */
  protocolVersion?: string;
  /** HTTP path for the MCP endpoint (default: "/mcp") */
  path?: string;
  /** HTTP path for the underlying GraphQL endpoint (default: "/graphql") */
  graphqlPath?: string;
  /** Path to a .graphql file or directory of .graphql files containing operations */
  operationsPath?: string;
  /** Raw GraphQL operations source string (alternative to operationsPath) */
  operationsStr?: string;
  /** Tool definitions. Each maps a tool name to a GraphQL operation */
  tools?: MCPToolConfig[];
  /** Static resource definitions served via resources/list and resources/read */
  resources?: MCPResourceConfig[];
  /** Dynamic resource templates with URI patterns and handler functions */
  resourceTemplates?: MCPResourceTemplateConfig[];
  /**
   * Description provider instances or configuration (e.g. Langfuse or custom providers)
   *
   * Custom providers: pass a DescriptionProvider instance containing fetchDescription or a config object for a built-in provider
   */
  providers?: {
    /** Built-in Langfuse provider. Accepts LangfuseClientParams (publicKey, secretKey, baseUrl) plus optional defaults */
    langfuse?: Prettify<
      LangfuseClientParams & {
        /** Default prompt.get() options applied to all Langfuse description lookups (e.g. { label: "production" }) */
        defaults?: Prettify<Partial<LangfuseGetPromptOptions>>;
      }
    >;
  } & {
    [key: string]: DescriptionProvider | Record<string, unknown> | undefined;
  };
  /** Suppress outputSchema from all tools in tools/list responses */
  suppressOutputSchema?: boolean;
  /** Block direct access to the GraphQL endpoint (only MCP path is accessible) */
  disableGraphQLEndpoint?: boolean;
  /** Hive App Deployment as an operation source. Fetches persisted documents; those with @mcpTool directives are auto-registered as tools, and all documents are available as named operations for tools with source.type: 'graphql'. */
  hive?: MCPHiveConfig;
}

/** Internal resolved form of a tool config after merging directive and explicit config sources. */
export interface ResolvedToolConfig {
  /** Unique tool name */
  name: string;
  /** Resolved GraphQL operation source */
  query: string;
  /** Metadata overrides (merged from directive + config) */
  tool?: MCPToolOverrides;
  /** Per-field input schema overrides */
  input?: MCPInputOverrides;
  /** Output extraction and schema configuration */
  output?: MCPOutputOverrides;
  /** Pre/post-process hooks */
  hooks?: MCPToolHooks;
  /** Description from @mcpTool directive (lower priority than config/provider) */
  directiveDescription?: string;
  /** Description from a provider (highest priority, resolved at request time) */
  providerDescription?: string;
}

/**
 * Parse a directive descriptionProvider string into a DescriptionProviderConfig.
 * Format: "type:prompt" or "type:prompt:version"
 * Example: "langfuse:my_prompt" or "langfuse:my_prompt:3"
 */
function parseDescriptionProviderDirective(
  value: string,
): DescriptionProviderConfig {
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid descriptionProvider directive format: "${value}". Expected "type:prompt" or "type:prompt:version" (e.g., "langfuse:my_prompt" or "langfuse:my_prompt:3")`,
    );
  }
  const [type, prompt, versionStr] = parts;
  if (parts.length === 3 && !versionStr) {
    throw new Error(
      `Invalid descriptionProvider directive format: "${value}". Trailing colon with no version. Expected "type:prompt" or "type:prompt:version".`,
    );
  }
  const config: DescriptionProviderConfig = { type, prompt };
  if (versionStr) {
    const version = Number(versionStr);
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(
        `Invalid version "${versionStr}" in descriptionProvider directive "${value}". Version must be a positive integer.`,
      );
    }
    config['version'] = version;
  }
  return config;
}

interface ResolveToolConfigsInput {
  tools: MCPToolConfig[];
  operationsSource?: string;
}

export function resolveToolConfigs(
  ctx: PluginContext,
  input: ResolveToolConfigsInput,
): ResolvedToolConfig[] {
  const { tools, operationsSource } = input;
  let parsedOps: ParsedOperation[] | undefined;

  if (operationsSource) {
    parsedOps = loadOperationsFromString(ctx, operationsSource);
  }

  // build base configs from @mcpTool directives
  const directiveTools = new Map();
  if (parsedOps) {
    for (const op of parsedOps) {
      if (!op.mcpDirective) continue;
      const toolOverrides: MCPToolOverrides = {};
      if (op.mcpDirective.title) toolOverrides.title = op.mcpDirective.title;
      if (op.mcpDirective.descriptionProvider) {
        toolOverrides.descriptionProvider = parseDescriptionProviderDirective(
          op.mcpDirective.descriptionProvider,
        );
      }
      let directiveInput: MCPInputOverrides | undefined;
      if (op.fieldDescriptionProviders) {
        const properties: Record<
          string,
          { descriptionProvider: DescriptionProviderConfig }
        > = {};
        for (const [varName, providerStr] of Object.entries(
          op.fieldDescriptionProviders,
        )) {
          properties[varName] = {
            descriptionProvider: parseDescriptionProviderDirective(providerStr),
          };
        }
        directiveInput = { schema: { properties } };
      }

      let directiveOutput: MCPOutputOverrides | undefined;
      if (op.selectionDescriptionProviders) {
        const descriptionProviders: Record<string, DescriptionProviderConfig> =
          {};
        for (const [path, providerStr] of Object.entries(
          op.selectionDescriptionProviders,
        )) {
          descriptionProviders[path] =
            parseDescriptionProviderDirective(providerStr);
        }
        directiveOutput = { descriptionProviders };
      }

      directiveTools.set(op.mcpDirective.name, {
        name: op.mcpDirective.name,
        query: op.document,
        directiveDescription: op.mcpDirective.description,
        tool: Object.keys(toolOverrides).length > 0 ? toolOverrides : undefined,
        input: directiveInput,
        output: directiveOutput,
      });
    }
  }

  // process explicit tools[] entries
  const configTools = new Map();
  for (const tool of tools) {
    const { source } = tool;
    let query: string;

    if (source.type === 'inline') {
      query = source.query!;
    } else {
      let opsPool: ParsedOperation[];
      if (source.file) {
        let fileSource: string;
        try {
          fileSource = readFileSync(resolve(source.file), 'utf-8');
        } catch (err) {
          throw new Error(
            `Tool "${tool.name}": cannot read operations file "${source.file}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        opsPool = loadOperationsFromString(ctx, fileSource);
      } else {
        opsPool = parsedOps || [];
      }
      const op = resolveOperation(
        opsPool,
        source.operationName!,
        source.operationType as 'query' | 'mutation',
      );
      if (!op) {
        throw new Error(
          `Operation "${source.operationName}" (${source.operationType}) not found in loaded operations for tool "${tool.name}"`,
        );
      }
      query = op.document;
    }

    configTools.set(tool.name, {
      name: tool.name,
      query,
      tool: tool.tool,
      input: tool.input,
      output: tool.output,
      hooks: tool.hooks,
    });
  }

  // merge: directive tools as base, config tools overlay (config wins for non-description fields)
  const merged = new Map<string, ResolvedToolConfig>(directiveTools);
  for (const [name, configTool] of configTools) {
    const base = merged.get(name);
    if (base) {
      merged.set(name, {
        name,
        query: configTool.query,
        directiveDescription: base.directiveDescription,
        tool: {
          ...base.tool,
          ...configTool.tool,
        },
        input: configTool.input || base.input,
        output: configTool.output || base.output,
        hooks: configTool.hooks || base.hooks,
      });
    } else {
      merged.set(name, configTool);
    }
  }

  return Array.from(merged.values());
}

const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/graphql',
  'application/yaml',
  'application/toml',
  'application/xhtml+xml',
  'application/svg+xml',
  'application/x-sh',
]);

export function isTextMimeType(mimeType: string): boolean {
  if (TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) return true;
  return TEXT_MIME_TYPES.has(mimeType);
}

export function resolveResources(
  ctx: PluginContext,
  configs: MCPResourceConfig[],
): Map<string, ResolvedResource> {
  const map = new Map<string, ResolvedResource>();

  for (const cfg of configs) {
    // Runtime validation for JSON/YAML config that bypasses TypeScript's discriminated union
    const raw = cfg as {
      name: string;
      uri: string;
      text?: string;
      file?: string;
      blob?: string;
    };
    const sourceCount =
      (raw.text != null ? 1 : 0) +
      (raw.file != null ? 1 : 0) +
      (raw.blob != null ? 1 : 0);
    if (sourceCount > 1) {
      throw new Error(
        `Resource "${raw.name}" (${raw.uri}): specify exactly one of "text", "file", or "blob"`,
      );
    }
    if (sourceCount === 0) {
      throw new Error(
        `Resource "${raw.name}" (${raw.uri}): must specify either "text", "file", or "blob"`,
      );
    }
    if (map.has(cfg.uri)) {
      throw new Error(
        `Duplicate resource URI "${cfg.uri}" (resource "${cfg.name}")`,
      );
    }

    const mimeType = cfg.mimeType || 'text/plain';
    let text: string | undefined;
    let blob: string | undefined;
    let size: number;

    if ('blob' in cfg && cfg.blob != null) {
      // Inline base64 — decode to validate and get accurate size
      const decoded = Buffer.from(cfg.blob, 'base64');
      if (decoded.toString('base64') !== cfg.blob) {
        throw new Error(
          `Resource "${cfg.name}" (${cfg.uri}): "blob" field contains invalid base64 encoding`,
        );
      }
      blob = cfg.blob;
      size = decoded.length;
    } else if ('file' in cfg && cfg.file != null) {
      // File: detect text vs binary from mimeType (overridable with binary flag)
      const filePath = resolve(cfg.file);
      const isBinary =
        cfg.binary !== undefined ? cfg.binary : !isTextMimeType(mimeType);
      try {
        if (isBinary) {
          const buf = readFileSync(filePath);
          blob = buf.toString('base64');
          size = buf.length;
        } else {
          text = readFileSync(filePath, 'utf-8');
          size = Buffer.byteLength(text);
        }
      } catch (err) {
        throw new Error(
          `Resource "${cfg.name}" (${cfg.uri}): cannot read file "${cfg.file}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (size === 0) {
        ctx.log.warn(
          `Resource "${cfg.name}" (${cfg.uri}): file "${cfg.file}" is empty (0 bytes)`,
        );
      }
    } else {
      // Inline text
      text = (cfg as { text: string }).text;
      size = Buffer.byteLength(text);
    }

    map.set(cfg.uri, {
      name: cfg.name,
      uri: cfg.uri,
      title: cfg.title,
      description: cfg.description,
      mimeType,
      size,
      icons: cfg.icons,
      annotations: cfg.annotations,
      text,
      blob,
      descriptionProvider: cfg.descriptionProvider,
    });
  }

  return map;
}

export function resolveResourceTemplates(
  configs: MCPResourceTemplateConfig[],
): ResolvedResourceTemplate[] {
  return configs.map((cfg) => {
    const { pattern, paramNames } = compileUriTemplate(cfg.uriTemplate);
    return {
      uriTemplate: cfg.uriTemplate,
      name: cfg.name,
      title: cfg.title,
      description: cfg.description,
      mimeType: cfg.mimeType,
      icons: cfg.icons,
      annotations: cfg.annotations,
      descriptionProvider: cfg.descriptionProvider,
      handler: cfg.handler,
      pattern,
      paramNames,
    };
  });
}

function loadOperationsSource(config: MCPConfig): string | undefined {
  if (!config.operationsPath) return undefined;

  const opsPath = resolve(config.operationsPath);
  let stat;
  try {
    stat = statSync(opsPath);
  } catch (err) {
    throw new Error(
      `Cannot access operations path "${config.operationsPath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (stat.isFile()) {
    return readFileSync(opsPath, 'utf-8');
  }

  if (stat.isDirectory()) {
    const files = readdirSync(opsPath).filter((f) => f.endsWith('.graphql'));
    if (files.length === 0) {
      throw new Error(
        `Operations directory "${config.operationsPath}" contains no .graphql files`,
      );
    }
    return files.map((f) => readFileSync(join(opsPath, f), 'utf-8')).join('\n');
  }

  throw new Error(
    `Operations path "${config.operationsPath}" is neither a file nor a directory`,
  );
}

/**
 * Create a Gateway plugin that exposes GraphQL operations as MCP tools.
 * Handles the full MCP protocol (initialize, tools/list, tools/call, resources)
 * by routing tool calls through the Yoga GraphQL pipeline.
 */
export function useMCP(ctx: PluginContext, config: MCPConfig): GatewayPlugin {
  if (!config.name?.trim()) {
    throw new Error(
      '[MCP] config.name is required and must be a non-empty string',
    );
  }
  if (config.tools != null && !Array.isArray(config.tools)) {
    throw new Error(
      '[MCP] config.tools must be an array of tool configurations',
    );
  }
  const mcpPath = config.path || '/mcp';
  const graphqlPath = config.graphqlPath || '/graphql';
  let registry: ToolRegistry | null = null;
  let schema: GraphQLSchema | null = null;

  ctx = { ...ctx, log: (config.log ?? ctx.log).child('[MCP] ') };
  const logger = ctx.log;

  // Resolve operations from files at startup
  const operationsSource = config.operationsStr || loadOperationsSource(config);
  let resolvedTools = resolveToolConfigs(ctx, {
    tools: config.tools || [],
    operationsSource,
  });

  // Hive App Deployment loader: async init + polling
  let hiveLoader: HiveLoader | null = null;
  let hiveInitPromise: Promise<void> | null = null;

  function rebuildToolsWithHiveSource(hiveSource: string) {
    const mergedSource = [hiveSource, operationsSource]
      .filter(Boolean)
      .join('\n');

    let newResolvedTools: ResolvedToolConfig[];
    try {
      newResolvedTools = resolveToolConfigs(ctx, {
        tools: config.tools || [],
        operationsSource: mergedSource || undefined,
      });
    } catch (err) {
      logger.error(
        `Failed to parse Hive operations. Keeping previous tools.`,
        err instanceof Error ? err.message : err,
      );
      return;
    }

    if (schema) {
      const previousTools = resolvedTools;
      try {
        const newRegistry = new ToolRegistry(ctx, newResolvedTools, schema);
        resolvedTools = newResolvedTools;
        const newOptions = buildHandlerOptions(newRegistry);
        registry = newRegistry;
        mcpHandlerOptions = newOptions;
        logger.info(
          `Tool registry rebuilt: ${newResolvedTools.length} tools registered`,
        );
      } catch (err) {
        resolvedTools = previousTools;
        logger.error(
          `Failed to rebuild tool registry after Hive update. Keeping previous tools.`,
          err instanceof Error ? err.message : err,
        );
      }
    } else {
      // Schema not yet available; update resolvedTools for when onSchemaChange fires
      resolvedTools = newResolvedTools;
    }
  }

  let disposed = false;
  let hiveInitFailed = false;
  let hiveInitFailedAt = 0;
  const HIVE_RETRY_COOLDOWN_MS = 30_000;
  let bootstrapFailedAt = 0;
  let bootstrapErrorMsg: string | undefined;
  let bootstrapPromise: Promise<void> | null = null;
  const BOOTSTRAP_RETRY_COOLDOWN_MS = 10_000;
  const internalRequests = new WeakSet<Request>();

  function docsToSource(docs: { body: string }[]): string {
    return docs.map((d) => d.body).join('\n');
  }

  function startHiveInit() {
    if (!hiveInitFailed && hiveInitPromise) return;
    hiveInitFailed = false;
    hiveInitPromise = hiveLoader!
      .fetchDocuments()
      .then((docs) => {
        if (disposed) return;
        const toolCount = docs.filter((d) =>
          d.body.includes('@mcpTool'),
        ).length;
        logger.info(
          `Loaded ${docs.length} documents from Hive (${toolCount} with @mcpTool)`,
        );
        rebuildToolsWithHiveSource(docsToSource(docs));

        hiveLoader!.startPolling((newDocs) => {
          const newToolCount = newDocs.filter((d) =>
            d.body.includes('@mcpTool'),
          ).length;
          logger.info(
            `Hive app deployment updated: ${newDocs.length} documents (${newToolCount} with @mcpTool)`,
          );
          rebuildToolsWithHiveSource(docsToSource(newDocs));
        }, docs);

        hiveInitPromise = null;
      })
      .catch((err) => {
        // Log but don't re-throw: avoids unhandled rejection.
        // onRequest will retry on next MCP request.
        hiveInitFailed = true;
        hiveInitFailedAt = Date.now();
        hiveInitPromise = null;
        logger.error(
          `Failed to fetch operations from Hive: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  if (config.hive) {
    hiveLoader = createHiveLoader(ctx, {
      token: config.hive.token,
      target: config.hive.target,
      appName: config.hive.appName,
      appVersion: config.hive.appVersion,
      endpoint: config.hive.endpoint || 'https://app.graphql-hive.com/graphql',
      pollIntervalMs: config.hive.pollIntervalMs ?? 60_000,
    });

    startHiveInit();
  }

  // Validate that tools referencing providers have matching entries in config
  for (const tool of resolvedTools) {
    const providerType = tool.tool?.descriptionProvider?.type;
    if (providerType && !config.providers?.[providerType]) {
      throw new Error(
        `Unknown description provider type: "${providerType}" for tool "${tool.name}"`,
      );
    }
    // Validate field-level providers
    if (tool.input?.schema?.properties) {
      for (const [fieldName, fieldOverrides] of Object.entries(
        tool.input.schema.properties,
      )) {
        const fieldProviderType = fieldOverrides.descriptionProvider?.type;
        if (fieldProviderType && !config.providers?.[fieldProviderType]) {
          throw new Error(
            `Unknown description provider type: "${fieldProviderType}" for tool "${tool.name}" field "${fieldName}"`,
          );
        }
      }
    }
    // Validate output field providers
    if (tool.output?.descriptionProviders) {
      for (const [dotPath, providerConfig] of Object.entries(
        tool.output.descriptionProviders,
      )) {
        if (providerConfig.type && !config.providers?.[providerConfig.type]) {
          throw new Error(
            `Unknown description provider type: "${providerConfig.type}" for tool "${tool.name}" output field "${dotPath}"`,
          );
        }
      }
    }
  }

  // Resolve resources at startup
  const resolvedResources =
    config.resources && config.resources.length > 0
      ? resolveResources(ctx, config.resources)
      : undefined;

  if (resolvedResources) {
    for (const [, resource] of resolvedResources) {
      const providerType = resource.descriptionProvider?.type;
      if (providerType && !config.providers?.[providerType]) {
        throw new Error(
          `Unknown description provider type: "${providerType}" for resource "${resource.name}"`,
        );
      }
    }
  }

  const providerResourceConfigs = resolvedResources
    ? Array.from(resolvedResources.values()).filter(
        (r) => r.descriptionProvider,
      )
    : [];

  // Resolve resource templates at startup
  const resolvedTemplates =
    config.resourceTemplates && config.resourceTemplates.length > 0
      ? resolveResourceTemplates(config.resourceTemplates)
      : undefined;

  if (resolvedTemplates) {
    for (const tmpl of resolvedTemplates) {
      const providerType = tmpl.descriptionProvider?.type;
      if (providerType && !config.providers?.[providerType]) {
        throw new Error(
          `Unknown description provider type: "${providerType}" for resource template "${tmpl.name}"`,
        );
      }
    }
  }

  const providerTemplateConfigs = resolvedTemplates
    ? resolvedTemplates.filter((t) => t.descriptionProvider)
    : [];

  // Resolved lazily on first use, then cached
  let resolvedProviders: ProviderRegistry | undefined;
  let providersPromise: Promise<ProviderRegistry> | undefined;

  function getProviders(): Promise<ProviderRegistry> {
    if (resolvedProviders) return Promise.resolve(resolvedProviders);
    if (!providersPromise) {
      providersPromise = resolveProviders(config.providers || {}).then(
        (p) => {
          resolvedProviders = p;
          return p;
        },
        (err) => {
          // Reset so next request retries instead of caching the rejection
          providersPromise = undefined;
          throw new Error(
            `Description provider initialization failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        },
      );
    }
    return providersPromise;
  }

  // Recomputed each time buildHandlerOptions is called so hive rebuilds are reflected
  let providerToolConfigs: ResolvedToolConfig[] = [];
  let fieldProviderToolConfigs: ResolvedToolConfig[] = [];
  let outputFieldProviderToolConfigs: ResolvedToolConfig[] = [];

  const mcpToolCalls = new WeakMap<Request, MCPToolCallContext>();
  let mcpHandlerOptions: MCPHandlerOptions | null = null;

  function buildHandlerOptions(reg: ToolRegistry): MCPHandlerOptions {
    providerToolConfigs = resolvedTools.filter(
      (t) => t.tool?.descriptionProvider,
    );
    fieldProviderToolConfigs = resolvedTools.filter((t) =>
      Object.values(t.input?.schema?.properties || {}).some(
        (p) => p.descriptionProvider,
      ),
    );
    outputFieldProviderToolConfigs = resolvedTools.filter(
      (t) =>
        t.output?.descriptionProviders &&
        Object.keys(t.output.descriptionProviders).length > 0,
    );

    return {
      serverName: config.name,
      serverVersion: config.version || '1.0.0',
      serverTitle: config.title,
      serverDescription: config.description,
      serverIcons: config.icons,
      serverWebsiteUrl: config.websiteUrl,
      instructions: config.instructions,
      protocolVersion: config.protocolVersion,
      suppressOutputSchema: config.suppressOutputSchema,
      registry: reg,
      resolveToolDescriptions:
        providerToolConfigs.length > 0
          ? async (resolverCtx) => {
              resolvedProviders = await getProviders();
              const resolved = await resolveDescriptions(
                ctx,
                providerToolConfigs,
                resolvedProviders,
                { isStartup: false, context: resolverCtx },
              );
              const map = new Map<string, string>();
              for (const tool of resolved) {
                if (tool.providerDescription) {
                  map.set(tool.name, tool.providerDescription);
                }
              }
              return map;
            }
          : undefined,
      resolveFieldDescriptions:
        fieldProviderToolConfigs.length > 0
          ? async (resolverCtx) => {
              resolvedProviders = await getProviders();
              const fieldDescs = await resolveFieldDescriptions(
                ctx,
                fieldProviderToolConfigs,
                resolvedProviders,
                { isStartup: false, context: resolverCtx },
              );
              for (const tool of fieldProviderToolConfigs) {
                const toolDescs = fieldDescs.get(tool.name);
                if (!toolDescs) continue;
                const aliases = tool.input?.schema?.properties;
                if (!aliases) continue;
                for (const [origName, overrides] of Object.entries(aliases)) {
                  if (overrides.alias && toolDescs.has(origName)) {
                    const desc = toolDescs.get(origName)!;
                    toolDescs.delete(origName);
                    toolDescs.set(overrides.alias, desc);
                  }
                }
              }
              return fieldDescs;
            }
          : undefined,
      resolveOutputFieldDescriptions:
        outputFieldProviderToolConfigs.length > 0
          ? async (resolverCtx) => {
              resolvedProviders = await getProviders();
              const map = new Map<string, Map<string, string>>();
              for (const tool of outputFieldProviderToolConfigs) {
                const providers = tool.output!.descriptionProviders!;
                const toolDescs = new Map<string, string>();
                for (const [dotPath, providerConfig] of Object.entries(
                  providers,
                )) {
                  const provider = resolvedProviders[providerConfig.type];
                  if (!provider) {
                    logger.error(
                      `Description provider "${providerConfig.type}" not found for output field "${dotPath}" on tool "${tool.name}". This should not happen — provider was validated at startup.`,
                    );
                    continue;
                  }
                  try {
                    const desc = await provider.fetchDescription(
                      `${tool.name}.output.${dotPath}`,
                      providerConfig,
                      resolverCtx,
                    );
                    if (desc) toolDescs.set(dotPath, desc);
                  } catch (err) {
                    logger.error(
                      `Output field description provider failed for "${tool.name}" field "${dotPath}": ${err instanceof Error ? err.message : String(err)}`,
                    );
                  }
                }
                if (toolDescs.size > 0) map.set(tool.name, toolDescs);
              }
              return map;
            }
          : undefined,
      resources: resolvedResources,
      resolveResourceDescriptions:
        providerResourceConfigs.length > 0
          ? async (resolverCtx) => {
              resolvedProviders = await getProviders();
              const map = new Map<string, string>();
              for (const resource of providerResourceConfigs) {
                const providerType = resource.descriptionProvider!.type;
                const provider = resolvedProviders[providerType];
                if (!provider) {
                  logger.error(
                    `Description provider "${providerType}" not found for resource "${resource.name}". This should not happen — provider was validated at startup.`,
                  );
                  continue;
                }
                try {
                  const desc = await provider.fetchDescription(
                    resource.name,
                    resource.descriptionProvider!,
                    resolverCtx,
                  );
                  if (desc) map.set(resource.uri, desc);
                } catch (err) {
                  logger.error(
                    `Resource description provider failed for "${resource.name}" (${resource.uri}): ${err instanceof Error ? err.message : String(err)}`,
                  );
                }
              }
              return map;
            }
          : undefined,
      resourceTemplates: resolvedTemplates,
      resolveTemplateDescriptions:
        providerTemplateConfigs.length > 0
          ? async (resolverCtx) => {
              resolvedProviders = await getProviders();
              const map = new Map<string, string>();
              for (const tmpl of providerTemplateConfigs) {
                const providerType = tmpl.descriptionProvider!.type;
                const provider = resolvedProviders[providerType];
                if (!provider) {
                  logger.error(
                    `Description provider "${providerType}" not found for template "${tmpl.name}". This should not happen — provider was validated at startup.`,
                  );
                  continue;
                }
                try {
                  const desc = await provider.fetchDescription(
                    tmpl.name,
                    tmpl.descriptionProvider!,
                    resolverCtx,
                  );
                  if (desc) map.set(tmpl.uriTemplate, desc);
                } catch (err) {
                  logger.error(
                    `Template description provider failed for "${tmpl.name}" (${tmpl.uriTemplate}): ${err instanceof Error ? err.message : String(err)}`,
                  );
                }
              }
              return map;
            }
          : undefined,
    };
  }

  function mcpErrorResponse(
    id: number | string,
    message: string,
    fetchAPI: FetchAPI,
  ) {
    return fetchAPI.Response.json({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      },
    });
  }

  return {
    onDispose() {
      disposed = true;
      hiveLoader?.stopPolling();
    },

    onSchemaChange({ schema: newSchema }) {
      try {
        const newRegistry = new ToolRegistry(ctx, resolvedTools, newSchema);
        const newOptions = buildHandlerOptions(newRegistry);
        schema = newSchema;
        registry = newRegistry;
        mcpHandlerOptions = newOptions;
      } catch (err) {
        logger.error(
          `Failed to rebuild tool registry after schema change. ` +
            `MCP tools will continue using the previous schema.`,
          err instanceof Error ? err.message : err,
        );
      }
    },

    onRequestParse({ request, url, setRequestParser }) {
      const ctx = mcpToolCalls.get(request);
      if (!ctx) {
        if (url.pathname === mcpPath) {
          logger.error(
            'onRequestParse: MCP-path request but WeakMap lookup missed, request object identity may have changed.',
          );
        }
        return;
      }

      setRequestParser(() => ({
        query: ctx.tool.query,
        variables: ctx.args,
      }));
    },

    async onRequest({
      request,
      url,
      endResponse,
      requestHandler,
      serverContext,
      fetchAPI,
    }) {
      // Block external GraphQL access when disableGraphQLEndpoint is set
      if (
        config.disableGraphQLEndpoint &&
        url.pathname === graphqlPath &&
        !internalRequests.has(request)
      ) {
        endResponse(new Response(null, { status: 404 }));
        return;
      }

      if (url.pathname !== mcpPath) {
        return;
      }

      // Wait for in-progress Hive init, or retry if previous init failed and cooldown elapsed
      if (hiveInitPromise) {
        await hiveInitPromise;
      } else if (hiveInitFailed && hiveLoader) {
        if (Date.now() - hiveInitFailedAt > HIVE_RETRY_COOLDOWN_MS) {
          startHiveInit();
          await hiveInitPromise;
        } else {
          logger.warn(
            `Serving MCP request with potentially stale tools: Hive init failed ${Math.round((Date.now() - hiveInitFailedAt) / 1000)}s ago. Will retry after ${Math.round(HIVE_RETRY_COOLDOWN_MS / 1000)}s cooldown.`,
          );
        }
      }

      // Schema bootstrap: one-time dispatch to trigger schema loading
      if (!registry || !schema || !mcpHandlerOptions) {
        if (Date.now() - bootstrapFailedAt < BOOTSTRAP_RETRY_COOLDOWN_MS) {
          return endResponse(
            fetchAPI.Response.json(
              {
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32000,
                  message: 'MCP server not ready. Schema loading failed.',
                },
              },
              { status: 503 },
            ),
          );
        }
        if (!bootstrapPromise) {
          bootstrapPromise = (async () => {
            try {
              const bootstrapReq = new Request(
                `http://localhost${graphqlPath}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query: '{ __typename }' }),
                },
              );
              internalRequests.add(bootstrapReq);
              await requestHandler(bootstrapReq, serverContext);
            } catch (bootstrapError) {
              bootstrapFailedAt = Date.now();
              bootstrapErrorMsg =
                bootstrapError instanceof Error
                  ? bootstrapError.message
                  : String(bootstrapError);
              logger.error(`Schema bootstrap failed:`, bootstrapErrorMsg);
            } finally {
              bootstrapPromise = null;
            }
          })();
        }
        await bootstrapPromise;

        if (!registry || !schema || !mcpHandlerOptions) {
          return endResponse(
            fetchAPI.Response.json(
              {
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32000,
                  message: bootstrapErrorMsg
                    ? `MCP server not ready. Schema loading failed: ${bootstrapErrorMsg}`
                    : 'MCP server not ready. Schema loading failed.',
                },
              },
              { status: 503 },
            ),
          );
        }
      }

      // Parse JSON-RPC body
      let bodyText: string;
      let body: JsonRpcRequest;
      try {
        bodyText = await request.text();
        const parsed = JSON.parse(bodyText);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error('Expected a JSON object');
        }
        body = parsed;
      } catch (parseError) {
        logger.error(
          `Failed to parse JSON-RPC request body:`,
          parseError instanceof Error ? parseError.message : parseError,
        );
        return endResponse(
          fetchAPI.Response.json(
            {
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: 'Parse error: Invalid JSON' },
            },
            { status: 400 },
          ),
        );
      }

      // tools/call: route through Yoga's pipeline via onRequestParse -> execute -> onResultProcess
      if (body.method === 'tools/call') {
        if (
          body.id !== null &&
          typeof body.id !== 'string' &&
          typeof body.id !== 'number'
        ) {
          return endResponse(
            fetchAPI.Response.json({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32600,
                message:
                  'Invalid Request: "id" must be a string, number, or null',
              },
            }),
          );
        }

        if (
          !body.params ||
          typeof body.params !== 'object' ||
          Array.isArray(body.params)
        ) {
          return endResponse(
            fetchAPI.Response.json({
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32602,
                message: 'Invalid params: expected an object with "name" field',
              },
            }),
          );
        }

        const callParams = body.params as {
          name?: string;
          arguments?: Record<string, unknown>;
        };

        if (!callParams.name || typeof callParams.name !== 'string') {
          return endResponse(
            fetchAPI.Response.json({
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32602,
                message: 'Invalid params: missing required "name" field',
              },
            }),
          );
        }

        if (
          callParams.arguments != null &&
          (typeof callParams.arguments !== 'object' ||
            Array.isArray(callParams.arguments))
        ) {
          return endResponse(
            fetchAPI.Response.json({
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32602,
                message: 'Invalid params: "arguments" must be an object',
              },
            }),
          );
        }

        const tool = registry.getTool(callParams.name);

        if (!tool) {
          return endResponse(
            fetchAPI.Response.json({
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32602,
                message: `Unknown tool: ${callParams.name}`,
              },
            }),
          );
        }

        const args = dealiasArgs(
          callParams.arguments || {},
          tool.argumentAliases,
        );

        // Extract forwarded headers
        const forwardedHeaders: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          forwardedHeaders[key] = value;
        });

        const hookContext: ToolHookContext = {
          toolName: callParams.name,
          headers: forwardedHeaders,
          query: tool.query,
        };

        // Preprocess hook can short-circuit execution
        if (tool.hooks?.preprocess) {
          try {
            const preprocessResult = await tool.hooks.preprocess(
              args,
              hookContext,
            );
            if (preprocessResult !== undefined) {
              const callResult = formatToolCallResult(
                ctx,
                preprocessResult,
                tool,
                {
                  hookProducedResult: true,
                  hasHooks: true,
                },
              );
              return endResponse(
                fetchAPI.Response.json({
                  jsonrpc: '2.0',
                  id: body.id,
                  result: callResult,
                }),
              );
            }
          } catch (hookError) {
            logger.error(
              `tools/call failed for tool "${callParams.name}":`,
              `preprocess hook failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`,
            );
            return endResponse(
              fetchAPI.Response.json({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        error: `preprocess hook failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`,
                      }),
                    },
                  ],
                  isError: true,
                },
              }),
            );
          }
        }

        // Route through Yoga's handle pipeline directly (parseRequest -> execute -> processResult)
        // This bypasses useUnhandledRoute, keeping the original /mcp URL for monitoring/tracing
        const mcpExecRequest = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: bodyText,
        });

        mcpToolCalls.set(mcpExecRequest, {
          jsonrpcId: body.id,
          toolName: callParams.name,
          args,
          tool,
          headers: forwardedHeaders,
        });

        try {
          const response = await requestHandler(mcpExecRequest, serverContext);
          return endResponse(response);
        } catch (execError) {
          logger.error(
            `tools/call execution failed for tool "${callParams.name}":`,
            execError instanceof Error ? execError.message : execError,
          );
          return endResponse(
            mcpErrorResponse(
              body.id,
              execError instanceof Error
                ? execError.message
                : String(execError),
              fetchAPI,
            ),
          );
        }
      }

      // All other MCP methods (initialize, tools/list, etc.)
      const rawPromptLabel = url.searchParams.get('promptLabel');
      const promptLabel =
        rawPromptLabel &&
        rawPromptLabel.length <= 256 &&
        /^[\w-]+$/.test(rawPromptLabel)
          ? rawPromptLabel
          : undefined;
      if (rawPromptLabel && !promptLabel) {
        logger.warn(
          `Invalid "promptLabel" query parameter ignored. Must be alphanumeric/hyphens/underscores, max 256 chars.`,
        );
      }
      if (
        promptLabel &&
        providerToolConfigs.length === 0 &&
        fieldProviderToolConfigs.length === 0 &&
        outputFieldProviderToolConfigs.length === 0 &&
        providerResourceConfigs.length === 0 &&
        providerTemplateConfigs.length === 0
      ) {
        logger.warn(
          `"promptLabel" query parameter was provided but no tools or resources use description providers. The parameter has no effect.`,
        );
      }
      const providerContext: DescriptionProviderContext | undefined =
        promptLabel ? { label: promptLabel } : undefined;

      let result;
      try {
        result = await handleMCPRequest(
          ctx,
          body,
          mcpHandlerOptions,
          providerContext,
        );
      } catch (err) {
        logger.error(
          `Unhandled error processing method "${body.method}":`,
          err instanceof Error ? err.message : err,
        );
        return endResponse(
          fetchAPI.Response.json({
            jsonrpc: '2.0',
            id: body.id ?? null,
            error: {
              code: -32603,
              message: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
            },
          }),
        );
      }

      if (result === null) {
        // notifications/initialized: no response
        endResponse(new Response(null, { status: 204 }));
      } else {
        endResponse(fetchAPI.Response.json(result));
      }
    },

    // Transform GraphQL execution result into MCP JSON-RPC response
    onResultProcess({ request, setResultProcessor }) {
      const reqCall = mcpToolCalls.get(request);
      if (!reqCall) return;

      mcpToolCalls.delete(request);

      setResultProcessor(async (executionResult, fetchAPI) => {
        try {
          // Validate execution result shape
          if (
            executionResult == null ||
            typeof executionResult !== 'object' ||
            Array.isArray(executionResult) ||
            isAsyncIterable(executionResult)
          ) {
            logger.error(
              `Unexpected execution result for tool "${reqCall.toolName}":`,
              typeof executionResult,
            );
            return mcpErrorResponse(
              reqCall.jsonrpcId,
              'Unexpected execution result format',
              fetchAPI,
            );
          }

          // Check for GraphQL errors (only fail if there's no usable data)
          if (executionResult.errors?.length) {
            const messages = (
              executionResult.errors as ReadonlyArray<{ message?: string }>
            )
              .map((e) => e.message || 'Unknown error')
              .filter(Boolean);
            const errorMessage =
              messages.length > 1
                ? `${messages[0]} (and ${messages.length - 1} more error${messages.length - 1 > 1 ? 's' : ''})`
                : messages[0] || 'GraphQL execution error';
            if (executionResult.data == null) {
              logger.error(
                `tools/call failed for tool "${reqCall.toolName}":`,
                messages.join('; '),
              );
              return mcpErrorResponse(
                reqCall.jsonrpcId,
                errorMessage,
                fetchAPI,
              );
            }
            // Partial success: log warning but continue with available data
            logger.warn(
              `tools/call partial success for tool "${reqCall.toolName}":`,
              messages.join('; '),
            );
          }

          // Post-execution: output.path, postprocess, format
          const response = await processExecutionResult(ctx, {
            id: reqCall.jsonrpcId,
            toolName: reqCall.toolName,
            args: reqCall.args,
            tool: reqCall.tool,
            data: executionResult.data,
            headers: reqCall.headers,
          });

          return fetchAPI.Response.json(response);
        } catch (error) {
          logger.error(
            `tools/call result processing failed for tool "${reqCall.toolName}":`,
            error instanceof Error ? error.message : error,
          );
          return mcpErrorResponse(
            reqCall.jsonrpcId,
            error instanceof Error ? error.message : String(error),
            fetchAPI,
          );
        }
      }, 'application/json');
    },
  };
}
