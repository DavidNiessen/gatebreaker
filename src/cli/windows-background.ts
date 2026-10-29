import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';

// Only the marked top-level window of the CDP-owned browser can be hidden.
// This helper receives no URLs, credentials, mouse or keyboard commands.
const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class GatebreakerBackground {
  public delegate bool Visitor(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(Visitor visit, IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int state);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool SetProp(IntPtr window, string key, IntPtr value);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr GetProp(IntPtr window, string key);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr RemoveProp(IntPtr window, string key);
  static IntPtr target;
  static uint owner;
  static string marker;
  static readonly object gate = new object();
  static bool stopped;
  static bool Owned() {
    uint current;
    GetWindowThreadProcessId(target, out current);
    return current == owner && GetProp(target, marker) == new IntPtr(1);
  }
  static bool BrowserWindow(IntPtr window) {
    uint current;
    GetWindowThreadProcessId(window, out current);
    if (current != owner) return false;
    var name = new StringBuilder(256);
    GetClassName(window, name, name.Capacity);
    return name.ToString() == "Chrome_WidgetWin_1";
  }
  static int VisibleCount() {
    int count = 0;
    EnumWindows(delegate(IntPtr window, IntPtr unused) {
      if (BrowserWindow(window) && IsWindowVisible(window)) count++;
      return true;
    }, IntPtr.Zero);
    return count;
  }
  public static void Run(uint process, string name) {
    owner = process; marker = name;
    for (int attempt = 0; attempt < 100 && target == IntPtr.Zero; attempt++) {
      EnumWindows(delegate(IntPtr window, IntPtr unused) {
        if (!BrowserWindow(window)) return true;
        var title = new StringBuilder(512);
        GetWindowText(window, title, title.Capacity);
        if (title.ToString().StartsWith(marker, StringComparison.Ordinal)) target = window;
        return target == IntPtr.Zero;
      }, IntPtr.Zero);
      if (target == IntPtr.Zero) Thread.Sleep(50);
    }
    if (target == IntPtr.Zero || !SetProp(target, marker, new IntPtr(1))) throw new Exception("Owned window unavailable");
    ShowWindow(target, 0);
    var timer = new Timer(delegate(object unused) {
      lock (gate) {
        if (!stopped && Owned() && IsWindowVisible(target)) ShowWindow(target, 0);
      }
    }, null, 0, 50);
    Console.WriteLine("ready");
    try {
      string command;
      while ((command = Console.ReadLine()) != null) {
        lock (gate) {
          if (command != "check" && command != "hide") throw new Exception("Unsupported command");
          bool owned = Owned();
          if (command == "hide" && owned && IsWindowVisible(target)) ShowWindow(target, 0);
          Console.WriteLine((owned && !IsWindowVisible(target) ? "hidden:" : "lost:") + VisibleCount());
        }
      }
    } finally {
      lock (gate) { stopped = true; timer.Dispose(); if (Owned()) RemoveProp(target, marker); }
    }
  }
}
"@
[uint32]$ownedBrowser = 0
if (-not [uint32]::TryParse($env:GATEBREAKER_BACKGROUND_PID, [ref]$ownedBrowser) -or $ownedBrowser -eq 0) { throw 'Invalid browser process' }
if ($env:GATEBREAKER_BACKGROUND_MARKER -notmatch '^Gatebreaker-background-[a-f0-9-]{36}$') { throw 'Invalid marker' }
[GatebreakerBackground]::Run($ownedBrowser, $env:GATEBREAKER_BACKGROUND_MARKER)
`;
interface Guard {
  process: ChildProcessWithoutNullStreams;
  check(force?: boolean): Promise<{ hidden: boolean; visibleWindows: number }>;
}
const owners = new WeakMap<BrowserContext, Map<number, Promise<Guard>>>();

async function windowId(context: BrowserContext, page: Page): Promise<number> {
  if (!context.pages().includes(page)) throw new Error('This window does not belong to the CLI.');
  const session = await context.newCDPSession(page);
  try {
    return (await session.send('Browser.getWindowForTarget')).windowId;
  } finally {
    await session.detach();
  }
}

export async function concealWindowsBackground(context: BrowserContext, page: Page): Promise<void> {
  if (process.platform !== 'win32') return;
  const id = await windowId(context, page);
  let guards = owners.get(context);
  if (!guards) {
    guards = new Map();
    owners.set(context, guards);
    const active = guards;
    context.once('close', () => {
      for (const guard of active.values())
        void guard.then(
          ({ process }) => process.kill(),
          () => {},
        );
      active.clear();
      owners.delete(context);
    });
  }
  let guard = guards.get(id);
  if (!guard) {
    guard = createGuard(context, page);
    guards.set(id, guard);
  }
  if (!(await (await guard).check(true)).hidden)
    throw new Error('The CLI background window could not be hidden.');
}

export async function windowsBackgroundStatus(context: BrowserContext, page: Page) {
  if (process.platform !== 'win32') return null;
  const guard = owners.get(context)?.get(await windowId(context, page));
  return guard ? (await guard).check() : null;
}

async function createGuard(context: BrowserContext, page: Page): Promise<Guard> {
  const browser = context.browser();
  if (!browser) throw new Error('Owned browser unavailable.');
  const session = await browser.newBrowserCDPSession();
  let pid: number | undefined;
  try {
    pid = (await session.send('SystemInfo.getProcessInfo')).processInfo.find(
      (info) => info.type === 'browser',
    )?.id;
  } finally {
    await session.detach();
  }
  if (!Number.isSafeInteger(pid) || pid! <= 0 || pid! > 0xffffffff)
    throw new Error('Owned browser process unavailable.');
  const window = await context.newCDPSession(page);
  try {
    const { windowId } = await window.send('Browser.getWindowForTarget');
    await window.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'minimized' },
    });
  } finally {
    await window.detach();
  }
  const marker = 'Gatebreaker-background-' + randomUUID();
  const title = await page.title();
  await page.evaluate((marker) => {
    document.title = marker;
  }, marker);
  const executable = path.join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
  const child = spawn(
    executable,
    [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GATEBREAKER_BACKGROUND_PID: String(pid),
        GATEBREAKER_BACKGROUND_MARKER: marker,
      },
    },
  );
  let pending: { resolve(line: string): void; reject(error: Error): void } | undefined;
  let buffer = '';
  let failed = false;
  const failure = new Error(
    'Windows could not hide the CLI-owned browser window. Check Windows PowerShell availability.',
  );
  const receive = () =>
    new Promise<string>((resolve, reject) => {
      if (failed) {
        reject(failure);
        return;
      }
      pending = { resolve, reject };
    });
  const fail = () => {
    failed = true;
    pending?.reject(failure);
    pending = undefined;
  };
  const ready = receive();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (data: string) => {
    buffer += data;
    if (buffer.length > 4096) {
      fail();
      child.kill();
      return;
    }
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (pending) {
        const request = pending;
        pending = undefined;
        request.resolve(line);
      } else {
        fail();
        child.kill();
      }
    }
  });
  const closed = () => {
    child.kill();
  };
  context.once('close', closed);
  child.once('exit', () => context.off('close', closed));
  child.stdin.on('error', fail);
  child.stdout.on('error', fail);
  child.stderr.resume();
  child.on('error', fail);
  child.on('exit', fail);
  const timeout = setTimeout(() => {
    fail();
    child.kill();
  }, 10000);
  try {
    if ((await ready) !== 'ready') throw failure;
  } catch (error) {
    child.stdin.end();
    child.kill();
    throw error;
  } finally {
    clearTimeout(timeout);
    if (!page.isClosed())
      await page
        .evaluate((title) => {
          document.title = title;
        }, title)
        .catch(() => {});
  }
  let sequence = Promise.resolve();
  return {
    process: child,
    check(force = false) {
      const result = sequence.then(async () => {
        if (failed) throw failure;
        const response = receive();
        const deadline = setTimeout(() => {
          fail();
          child.kill();
        }, 3000);
        child.stdin.write(force ? 'hide\n' : 'check\n');
        let line: string;
        try {
          line = await response;
        } finally {
          clearTimeout(deadline);
        }
        if (!/^(?:hidden|lost):\d+$/.test(line)) throw failure;
        return { hidden: line.startsWith('hidden:'), visibleWindows: Number(line.split(':')[1]) };
      });
      sequence = result.then(
        () => {},
        () => {},
      );
      return result;
    },
  };
}
