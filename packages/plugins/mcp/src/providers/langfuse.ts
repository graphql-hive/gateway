import type { Langfuse } from 'langfuse';
import type {
  DescriptionProvider,
  DescriptionProviderConfig,
  DescriptionProviderContext,
} from '../description-provider.js';

export type LangfuseGetPromptOptions = NonNullable<
  Parameters<Langfuse['getPrompt']>[2]
>;

export function createLangfuseProvider(
  client: Langfuse,
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
      const options = hasOverrides
        ? {
            ...defaults,
            ...perToolOptions,
            ...(context?.label ? { label: context.label } : undefined),
          }
        : perToolOptions;
      const prompt = await client.getPrompt(
        promptName,
        version,
        options as any,
      );
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
