export const projectRoot: string;
export function prepareDevRuntime(options?: {
  root?: string;
  platform?: string;
  arch?: string;
  electronVersion?: string;
  buildRuntime?: (
    output: string,
    options: { root: string; electronVersion: string; arch: string },
  ) => Promise<string>;
}): Promise<string | undefined>;
