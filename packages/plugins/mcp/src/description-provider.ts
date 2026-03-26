import type { ResolvedToolConfig } from './plugin.js';

/** Configuration object for a description provider, identified by `type` with provider-specific fields. */
export interface DescriptionProviderConfig {
  /** Provider type identifier (e.g. "langfuse") */
  type: string;
  /** Provider-specific configuration fields */
  [key: string]: unknown;
}

/** Request-scoped context passed to description providers (e.g. prompt label for A/B testing). */
export interface DescriptionProviderContext {
  /** Prompt label for selecting provider variants (e.g. "production", "staging") */
  label?: string;
}

/** Interface for custom description providers that dynamically resolve tool/resource descriptions. */
export interface DescriptionProvider {
  /**
   * Fetch a description for a tool or resource.
   * @param toolName - The name of the tool or resource
   * @param config - Provider-specific configuration from the tool/resource definition
   * @param context - Optional request-scoped context (e.g. prompt label)
   * @returns The resolved description string
   */
  fetchDescription(
    toolName: string,
    config: DescriptionProviderConfig,
    context?: DescriptionProviderContext,
  ): Promise<string>;
}

export type ProviderRegistry = Record<string, DescriptionProvider>;

export function createProviderRegistry(
  providers: Record<string, DescriptionProvider>,
): ProviderRegistry {
  return { ...providers };
}

function isDescriptionProvider(value: unknown): value is DescriptionProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as any).fetchDescription === 'function'
  );
}

async function resolveBuiltinProvider(
  name: string,
  options: Record<string, unknown>,
): Promise<DescriptionProvider> {
  if (name === 'langfuse') {
    let Langfuse: any;
    try {
      const mod = await import('langfuse');
      Langfuse = mod.default || mod.Langfuse;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('Cannot find') ||
        message.includes('ERR_MODULE_NOT_FOUND')
      ) {
        throw new Error(
          `The "langfuse" provider requires the "langfuse" package. Install it with: npm install langfuse`,
        );
      }
      throw new Error(`Failed to load the "langfuse" package: ${message}`);
    }
    if (typeof Langfuse !== 'function') {
      throw new Error(
        `Failed to resolve the Langfuse constructor. Ensure you have a compatible version installed (langfuse ^3.0.0).`,
      );
    }
    const { createLangfuseProvider } = await import('./providers/langfuse.js');
    const { defaults, ...langfuseOptions } = options;
    if (
      defaults !== undefined &&
      (typeof defaults !== 'object' ||
        defaults === null ||
        Array.isArray(defaults))
    ) {
      throw new Error(
        `Langfuse provider "defaults" must be an object (e.g., { label: "production" }), got ${Array.isArray(defaults) ? 'array' : typeof defaults}`,
      );
    }
    try {
      return createLangfuseProvider(
        new Langfuse(langfuseOptions),
        defaults as Parameters<typeof createLangfuseProvider>[1],
      );
    } catch (err) {
      throw new Error(
        `Failed to initialize Langfuse client. Ensure LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, and LANGFUSE_BASEURL env vars are set. ` +
          `Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  throw new Error(
    `Unknown provider "${name}". Built-in providers: "langfuse". ` +
      `For custom providers, pass a DescriptionProvider object with a fetchDescription() method.`,
  );
}

export async function resolveProviders(
  providers: Record<
    string,
    DescriptionProvider | Record<string, unknown> | undefined
  >,
): Promise<ProviderRegistry> {
  const registry: ProviderRegistry = {};

  for (const [name, entry] of Object.entries(providers)) {
    if (!entry) continue;
    registry[name] = isDescriptionProvider(entry)
      ? entry
      : await resolveBuiltinProvider(name, entry as Record<string, unknown>);
  }

  return registry;
}

interface ResolveDescriptionsOptions {
  isStartup?: boolean;
  context?: DescriptionProviderContext;
}

export async function resolveDescriptions(
  tools: ResolvedToolConfig[],
  providers: ProviderRegistry,
  options: ResolveDescriptionsOptions = { isStartup: false },
): Promise<ResolvedToolConfig[]> {
  const resolved = await Promise.all(
    tools.map(async (tool) => {
      const providerConfig = tool.tool?.descriptionProvider;
      if (!providerConfig) return tool;

      const provider = providers[providerConfig.type];
      if (!provider) {
        throw new Error(
          `Unknown description provider type: "${providerConfig.type}" for tool "${tool.name}"`,
        );
      }

      try {
        const description = await provider.fetchDescription(
          tool.name,
          providerConfig,
          options.context,
        );
        return { ...tool, providerDescription: description };
      } catch (err) {
        if (options.isStartup) {
          throw err;
        }
        console.error(
          `[MCP] Description provider failed for tool "${tool.name}": ${err instanceof Error ? err.message : String(err)}`,
        );
        return tool;
      }
    }),
  );

  return resolved;
}

/** Resolve per-field descriptions from providers. Returns toolName -> fieldName -> description. */
export async function resolveFieldDescriptions(
  tools: ResolvedToolConfig[],
  providers: ProviderRegistry,
  options: ResolveDescriptionsOptions = { isStartup: false },
): Promise<Map<string, Map<string, string>>> {
  const result = new Map<string, Map<string, string>>();

  await Promise.all(
    tools.map(async (tool) => {
      const properties = tool.input?.schema?.properties;
      if (!properties) return;

      const fieldEntries = Object.entries(properties).filter(
        ([, v]) => v.descriptionProvider,
      );
      if (fieldEntries.length === 0) return;

      const fieldMap = new Map<string, string>();

      await Promise.all(
        fieldEntries.map(async ([fieldName, fieldOverrides]) => {
          const providerConfig = fieldOverrides.descriptionProvider!;
          const provider = providers[providerConfig.type];
          if (!provider) {
            throw new Error(
              `Unknown field description provider type: "${providerConfig.type}" for tool "${tool.name}" field "${fieldName}"`,
            );
          }

          try {
            const description = await provider.fetchDescription(
              tool.name,
              providerConfig,
              options.context,
            );
            fieldMap.set(fieldName, description);
          } catch (err) {
            if (options.isStartup) {
              throw err;
            }
            console.error(
              `[MCP] Field description provider failed for tool "${tool.name}" field "${fieldName}": ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }),
      );

      if (fieldMap.size > 0) {
        result.set(tool.name, fieldMap);
      }
    }),
  );

  return result;
}
