import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

/** Package the same buildable native sources that are reviewed and compiled in this repo. */
export async function createAndroidBundle(root = path.resolve("android")) {
  const zip = new JSZip();
  const include = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["build", ".gradle", "local.properties", ".gitignore"].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await include(file);
      else if (entry.isFile()) zip.file(path.relative(root, file).split(path.sep).join("/"), await readFile(file), { unixPermissions: entry.name === "gradlew" ? 0o755 : 0o644 });
    }
  };
  await include(root);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: "UNIX" });
}
