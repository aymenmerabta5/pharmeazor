import { defineSandbox } from "eve/sandbox";
import { JustBashSandbox } from "eve/sandbox/just-bash";
import { VercelSandbox } from "eve/sandbox/vercel";

const environment = process.env.VERCEL
  ? VercelSandbox.environment()
  : JustBashSandbox.environment({ autoInstall: false });

export { environment };

export default defineSandbox(() => environment.open());
