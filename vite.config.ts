import { createTauriViteConfig } from "@pziel/pureui/vite";

export default createTauriViteConfig({
  appUrl: import.meta.url,
  devPort: 1431,
  hmrPort: 1432,
});
