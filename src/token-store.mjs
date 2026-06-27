import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export class TokenStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async readToken() {
    try {
      const data = JSON.parse(await readFile(this.filePath, "utf8"));
      return data.token || null;
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async writeToken(token) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      JSON.stringify({ token, updatedAt: new Date().toISOString() }, null, 2),
      { encoding: "utf8", mode: 0o600 }
    );
  }
}
