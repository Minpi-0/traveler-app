import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ⚠️ 將 repo-name 改成你的 GitHub Repo 名稱
export default defineConfig({
  plugins: [react()],
  base: "/traveler-app/"
});
