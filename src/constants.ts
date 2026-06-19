import path from "node:path";
import { environment } from "@raycast/api";

export const DOWNLOAD_PATH = path.join(environment.supportPath, "jitendex-yomitan.zip");
export const DB_PATH = path.join(environment.supportPath, "jitendex.db");
export const SQLITE_WASM_PATH = path.join(environment.assetsPath, "sql-wasm-fts5.wasm");
