import fs from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { Toast } from "@raycast/api";

type JitendexManifest = {
  downloadUrl: string;
};

export async function getLatestDictionaryUrl() {
  try {
    const manifestRes = await fetch("https://jitendex.org/static/yomitan.json");
    if (!manifestRes.ok) throw new Error(`Jitendex manifest returned ${manifestRes.status}`);
    const manifest = (await manifestRes.json()) as JitendexManifest;
    if (!manifest.downloadUrl) throw new Error("Jitendex manifest has no download URL");
    return manifest.downloadUrl;
  } catch (error) {
    console.log("Failed to fetch latest dictionary:", error);
  }
}

export async function downloadFile(url: string, destination: string, toast: Toast, abortSignal: AbortSignal) {
  try {
    const res = await fetch(url, { signal: abortSignal });
    if (!res.body) throw new Error("Failed to fetch dictionary: No response body");

    const contentLength = res.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    let downloadedBytes = 0;

    console.log("Downloading to", destination);
    const fileStream = fs.createWriteStream(destination, { flags: "w" });
    const readableStream = Readable.fromWeb(res.body);

    // Handle cancellation
    abortSignal.addEventListener(
      "abort",
      () => {
        readableStream.destroy();
        fileStream.destroy();
      },
      { once: true },
    );

    readableStream.on("data", (chunk) => {
      downloadedBytes += chunk.length;
      const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
      toast.message = `Progress: ${progress}%`;
    });

    await finished(readableStream.pipe(fileStream));
    return destination;
  } catch (error) {
    if (abortSignal.aborted) {
      console.log("Download cancelled by user");
      return;
    }

    console.error("Error downloading dictionary:", error);
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to download dictionary";
    toast.message = "Please try again later.";
  }
}
