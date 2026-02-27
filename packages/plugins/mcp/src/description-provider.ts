import type { ResolvedToolConfig } from './plugin.js';

export interface DescriptionProviderConfig {
  type: string;
  [key: string]: unknown;
}

export interface DescriptionProvider {
  fetchDescription(
    toolName: string,
    config: DescriptionProviderConfig,
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
    try {
      return createLangfuseProvider(new Langfuse());
    } catch (err) {
      throw new Error(
        `Failed to initialize Langfuse client. Ensure LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, and LANGFUSE_BASE_URL env vars are set. ` +
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
  providers: Record<string, DescriptionProvider | Record<string, unknown>>,
): Promise<ProviderRegistry> {
  const registry: ProviderRegistry = {};

  for (const [name, entry] of Object.entries(providers)) {
    registry[name] = isDescriptionProvider(entry)
      ? entry
      : await resolveBuiltinProvider(name);
  }

  return registry;
}

interface ResolveDescriptionsOptions {
  isStartup?: boolean;
}

export async function resolveDescriptions(
  tools: ResolvedToolConfig[],
  providers: ProviderRegistry,
  options: ResolveDescriptionsOptions = { isStartup: true },
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
        );
        return { ...tool, providerDescription: description };
      } catch (err) {
        if (options.isStartup) {
          throw err;
        }
        console.warn(
          `Description provider failed for tool "${tool.name}": ${err instanceof Error ? err.message : String(err)}`,
        );
        return tool;
      }
    }),
  );

  return resolved;
}
