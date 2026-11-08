import { defineSandbox, type SandboxDefinition } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";
import {
  vercel,
  type VercelSandboxBootstrapUseOptions,
  type VercelSandboxSessionUseOptions,
} from "eve/sandbox/vercel";

const sandbox:
  | SandboxDefinition
  | SandboxDefinition<VercelSandboxBootstrapUseOptions, VercelSandboxSessionUseOptions> = process
  .env.VERCEL
  ? defineSandbox({ backend: vercel() })
  : defineSandbox({ backend: justbash({ autoInstall: false }) });

export default sandbox;
