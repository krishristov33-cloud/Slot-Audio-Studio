import { zipSync } from "fflate";

export function zipFiles(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 0 });
}
