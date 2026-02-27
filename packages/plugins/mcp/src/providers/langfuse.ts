import type {
  DescriptionProvider,
  DescriptionProviderConfig,
} from '../description-provider.js';

export interface LangfuseClient {
  getPrompt(
    name: string,
    version?: number,
    options?: { label?: string },
  ): Promise<{ compile(): string }>;
}

export function createLangfuseProvider(
  client: LangfuseClient,
): DescriptionProvider {
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
      const label = config['label'] as string | undefined;

      const options = label !== undefined ? { label } : undefined;
      const prompt = await client.getPrompt(promptName, version, options);
      return prompt.compile();
    },
  };
}
