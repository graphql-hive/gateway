import type { Langfuse } from 'langfuse';
import type {
  DescriptionProvider,
  DescriptionProviderConfig,
} from '../description-provider.js';

export type LangfuseGetPromptOptions = NonNullable<
  Parameters<Langfuse['getPrompt']>[2]
>;

export function createLangfuseProvider(client: Langfuse): DescriptionProvider {
  return {
    async fetchDescription(
      _toolName: string,
      config: DescriptionProviderConfig,
    ): Promise<string> {
      const promptName = config['prompt'];
      if (typeof promptName !== 'string' || !promptName) {
        throw new Error(
          `Langfuse provider requires a non-empty "prompt" field in descriptionProvider config`,
        );
      }
      const version = config['version'] as number | undefined;
      const options = config['options'] as LangfuseGetPromptOptions | undefined;
      const prompt = await client.getPrompt(
        promptName,
        version,
        options as any,
      );
      return prompt.compile();
    },
  };
}
