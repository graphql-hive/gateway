import { defineConfig } from '@graphql-hive/gateway';
import ld from '@launchdarkly/node-server-sdk';

const {
  LAUNCH_DARKLY_PROJECT_ID,
  LAUNCH_DARKLY_ENVIRONMENT,
  LAUNCH_DARKLY_REST_API_KEY,
  LAUNCH_DARKLY_SDK_KEY,
} = process.env;

const LABEL_PREFIX = 'launchDarkly:';

let flagValues: Record<string, number> = {};
listenForFlagUpdates((name, value) => {
  flagValues[name] = value;
});

export const gatewayConfig = defineConfig({
  progressiveOverride(label) {
    // ignore labels that don't start with our prefix
    if (!label.startsWith(LABEL_PREFIX)) return false;
    // remove prefix from label
    const flagKey = label.substring(LABEL_PREFIX.length);
    // find flagKey in flagValues and roll the dice to see if we should override
    const flagValue = flagValues[flagKey];
    if (!flagValue) return false;
    return Math.random() * 100 < flagValue;
  },
});

export async function listenForFlagUpdates(
  listener: (name: string, value: number) => void,
) {
  if (
    !LAUNCH_DARKLY_SDK_KEY ||
    !LAUNCH_DARKLY_REST_API_KEY ||
    !LAUNCH_DARKLY_PROJECT_ID ||
    !LAUNCH_DARKLY_ENVIRONMENT
  ) {
    console.error('LaunchDarkly environment variables are not set');
    return;
  }
  const ldClient = ld.init(LAUNCH_DARKLY_SDK_KEY);
  await ldClient.waitForInitialization();

  const allFlagsResult = await (
    await fetch(
      `https://app.launchdarkly.com/api/v2/flags/${LAUNCH_DARKLY_PROJECT_ID}?env=${LAUNCH_DARKLY_ENVIRONMENT}`,
      {
        headers: {
          Authorization: LAUNCH_DARKLY_REST_API_KEY,
        },
      },
    )
  ).json();

  for (const flag of allFlagsResult.items) {
    const ffKey = flag.key;
    const variations =
      flag.environments[LAUNCH_DARKLY_ENVIRONMENT]._summary.variations;
    if (Object.keys(variations).length === 2 && variations['0'].rollout) {
      listener(ffKey, variations['0'].rollout / 1000);
    }
  }

  ldClient.on('update', async (param) => {
    const updatedFlag = await (
      await fetch(
        `https://app.launchdarkly.com/api/v2/flags/${LAUNCH_DARKLY_PROJECT_ID}/${param.key}?env=${LAUNCH_DARKLY_ENVIRONMENT}`,
        {
          headers: {
            Authorization: LAUNCH_DARKLY_REST_API_KEY,
          },
        },
      )
    ).json();
    listener(
      param.key,
      updatedFlag.environments[LAUNCH_DARKLY_ENVIRONMENT].fallthrough.rollout
        .variations[0].weight / 1000,
    );
  });
}
