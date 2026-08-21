import pc from 'picocolors';
import { CliError, createCli } from './cli';

/** Entry point for the `colophon` binary. */
export async function main(argv: string[]): Promise<number> {
  try {
    await createCli().parseAsync(argv, { from: 'user' });
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      // Already-explained failures print one line, not a stack trace.
      // eslint-disable-next-line no-console
      console.error(pc.red(`error: ${error.message}`));
      return 1;
    }
    // commander throws for --help and --version, which are not failures.
    const code = (error as { code?: string }).code;
    if (code === 'commander.helpDisplayed' || code === 'commander.version') {
      return 0;
    }
    if (code === 'commander.help') {
      return 0;
    }
    // eslint-disable-next-line no-console
    console.error(pc.red(`error: ${(error as Error).message}`));
    return 1;
  }
}
