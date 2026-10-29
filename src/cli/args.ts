export interface Arguments {
  urls: string[];
  json: boolean;
  inspect: boolean;
  download: boolean;
  quiet: boolean;
  directory: string;
  timeout: number;
  session?: string;
  comment?: string;
  command?: 'help' | 'version' | 'providers';
}

export class UsageError extends Error {}

export function parseArguments(argv: readonly string[]): Arguments {
  const result: Arguments = {
    urls: [],
    json: false,
    inspect: false,
    download: false,
    quiet: false,
    directory: '.',
    timeout: 120,
  };
  let positional = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '--' && !positional) {
      positional = true;
      continue;
    }
    if (positional || !arg.startsWith('-')) {
      result.urls.push(arg);
      continue;
    }
    switch (arg) {
      case '--help':
      case '-h':
        result.command = 'help';
        break;
      case '--version':
      case '-v':
        result.command = 'version';
        break;
      case '--providers':
        result.command = 'providers';
        break;
      case '--json':
        result.json = true;
        break;
      case '--inspect':
        result.inspect = true;
        break;
      case '--download':
      case '-d':
        result.download = true;
        break;
      case '--quiet':
      case '-q':
        result.quiet = true;
        break;
      case '--directory':
      case '-o':
      case '--timeout':
      case '--session':
      case '--soundcloud-comment': {
        const value = argv[++index];
        if (value === undefined || value.startsWith('--') || !value.trim())
          throw new UsageError(`${arg} requires a value.`);
        if (arg === '--timeout') {
          if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 3600)
            throw new UsageError('--timeout must be between 1 and 3600 seconds.');
          result.timeout = Number(value);
        } else if (arg === '--session') result.session = value;
        else if (arg === '--soundcloud-comment') result.comment = value;
        else result.directory = value;
        break;
      }
      default:
        throw new UsageError(`Unknown option: ${arg.split('=')[0]}. See --help.`);
    }
  }
  if (!result.command && !result.urls.length)
    throw new UsageError('Supply at least one gate URL. See --help.');
  if (result.inspect && result.download)
    throw new UsageError('--inspect and --download cannot be combined.');
  return result;
}

export const help = `Gatebreaker — resolve supported download gates using HTTP

Usage: gatebreaker [options] <url> [url ...]

  -d, --download             Save file rewards (otherwise print URLs)
  -o, --directory <path>     Download directory (default: current directory)
      --json                One JSON object per input; progress stays on stderr
      --inspect             Inspect metadata without submitting gate steps
      --session <file>       Read your explicit cookie/native-session JSON file
      --soundcloud-comment <text>  Your reusable required comment text
      --timeout <seconds>   Total per-gate deadline, including downloads (default: 120)
  -q, --quiet                Suppress progress on stderr
      --providers           List provider adapters
  -v, --version             Show version
  -h, --help                Show help

Resolution permits supported automatic HTTP steps, including the configured
email submission. Login, CAPTCHA and browser-only steps can still be required;
this CLI does not open a browser or import browser credentials automatically.
Page rewards are printed, never downloaded as files. Existing files are not
overwritten. JSON results may contain private signed download links.
Exit codes: 0 success, 1 gate/request/file failure, 2 usage, 130 interrupted.
`;
