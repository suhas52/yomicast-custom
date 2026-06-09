import { LaunchProps, LaunchType, launchCommand, open, showToast, Toast } from "@raycast/api";
import { crossLaunchCommand } from "raycast-cross-extension";

type OCRResult = {
  text?: string | null;
  error?: string;
};

export default async function Command({ launchContext = {} }: LaunchProps<{ launchContext?: OCRResult }>) {
  const { text, error } = launchContext;

  if (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "OCR failed",
      message: error,
    });
    return;
  }

  if (typeof text === "string") {
    const query = text.trim();
    if (!query) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No text detected",
      });
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
    await showToast({
      style: Toast.Style.Failure,
      title: "No text detected",
    });
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
  ).catch(async () => {
    await open("raycast://extensions/huzef44/screenocr");
  });
}
