import { LaunchProps, LaunchType, launchCommand } from "@raycast/api";
import { crossLaunchCommand } from "raycast-cross-extension";

type OCRResult = {
  text?: string | null;
  error?: string;
};

export default async function Command({ launchContext = {} }: LaunchProps<{ launchContext?: OCRResult }>) {
  const { text, error } = launchContext;

  if (error) {
    return;
  }

  if (typeof text === "string") {
    const query = text.trim();
    if (!query) {
      return;
    }

    await launchCommand({
      name: "translate",
      type: LaunchType.UserInitiated,
      context: { query },
    });
    return;
  }

  if (text === null) {
    return;
  }

  await crossLaunchCommand(
    {
      name: "recognize-text",
      type: LaunchType.Background,
      extensionName: "screenocr",
      ownerOrAuthorName: "huzef44",
    },
    {
      name: "translate",
      type: LaunchType.UserInitiated,
    },
  ).catch(() => {});
}
