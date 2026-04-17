import type { LangfuseClient, PromptManager } from '@langfuse/client';
import type {
  DescriptionProvider,
  DescriptionProviderConfig,
  DescriptionProviderContext,
} from '../description-provider.js';

/** Options type for text prompt retrieval via `PromptManager.get()`, derived from the Langfuse SDK. */
export type LangfuseGetPromptOptions = NonNullable<
  Parameters<
    {
      get(
        name: string,
        options?: PromptManager extends {
          get(name: string, options?: infer TextOpts): Promise<any>;
          get(...args: any[]): any;
        }
          ? TextOpts
          : never,
      ): any;
    }['get']
  >[1]
>;

/** Create a description provider backed by Langfuse prompt management. */
export function createLangfuseProvider(
  client: LangfuseClient,
  defaults?: Partial<LangfuseGetPromptOptions>,
): DescriptionProvider {
  return {
    async fetchDescription(
      _toolName: string,
      config: DescriptionProviderConfig,
      context?: DescriptionProviderContext,
    ): Promise<string> {
      const promptName = config['prompt'];
      if (typeof promptName !== 'string' || !promptName) {
        throw new Error(
          `Langfuse provider requires a non-empty "prompt" field in descriptionProvider config`,
        );
      }
      const version = config['version'] as number | undefined;
      const perToolOptions = config['options'] as
        | LangfuseGetPromptOptions
        | undefined;
      const hasDefaults = defaults && Object.keys(defaults).length > 0;
      const hasOverrides = hasDefaults || perToolOptions || context?.label;
      const options: LangfuseGetPromptOptions = {
        ...(hasOverrides
          ? {
              ...defaults,
              ...perToolOptions,
              ...(context?.label ? { label: context.label } : undefined),
            }
          : perToolOptions),
      };

      if (version != null) {
        options.version = version;
        delete options.label; // Langfuse rejects version + label together
      }

      const prompt = await client.prompt.get(promptName, {
        ...options,
        type: 'text',
      });
      const compiled = prompt.compile();
      if (typeof compiled !== 'string') {
        throw new Error(
          `Langfuse prompt "${promptName}" returned ${typeof compiled} from compile(). ` +
            `MCP description providers require a text prompt, not a chat prompt.`,
        );
      }
      return compiled;
    },
  };
}
