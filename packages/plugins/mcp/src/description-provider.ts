import type { ResolvedToolConfig } from './plugin.js';

export interface DescriptionProviderConfig {
  type: string;
  [key: string]: unknown;
}

export interface DescriptionProvider {
  fetchDescription(toolName: string, config: DescriptionProviderConfig): Promise<string>;
}

export type ProviderRegistry = Record<string, DescriptionProvider>;

export function createProviderRegistry(providers: Record<string, DescriptionProvider>): ProviderRegistry {
  return { ...providers };
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
        throw new Error(`Unknown description provider type: "${providerConfig.type}" for tool "${tool.name}"`);
      }

      try {
        const description = await provider.fetchDescription(tool.name, providerConfig);
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
