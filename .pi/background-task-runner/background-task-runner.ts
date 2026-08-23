/**
 * background-task-runner — portable background shell jobs for Pi.
 *
 * Recreated from the shell-task portion of ismailsaleekh/pi-background-tasks
 * (ISC licensed), vendored into this repo and simplified:
 *   - shell task backgrounding: bg_run / bg_status / bg_logs / bg_kill tools,
 *     /bg /jobs /logs /kill /bg-clear commands, footer status, completion
 *     notification delivered through pi.sendMessage.
 *   - deliberately NOT included: delegated child agents (bg_delegate),
 *     multi-model Fusion, attested Pi runs, Anthropic attribution, telemetry
 *     wrapping, the interactive task-manager dock, update checks.
 *
 * Behavior mirrors the upstream project for the covered surface: tasks spawn
 * detached process groups, stream stdout+stderr into `.pi/tasks/<session>-<pid>/<id>.output`,
 * write `<id>.json` metadata, get SIGTERM then SIGKILL escalation on kill,
 * and notify the parent agent on terminal state via a custom message type.
 */

import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { join, extname, isAbsolute, win32 } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ThemeColor,
} from '@earendil-works/pi-coding-agent';
import { Text, type KeyId } from '@earendil-works/pi-tui';
import { Type, type Static } from 'typebox';

const STATUS_INTERVAL_MS = 1000;
const COMMAND_PREVIEW_CHARS = 90;
const DEFAULT_LOG_BYTES = 50 * 1024;
const MAX_LOG_BYTES = 50 * 1024;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const KILL_GRACE_MS = 3000;
const STOP_WAIT_MS = KILL_GRACE_MS + 1500;
const MAX_RECENT_TASKS = 100;

const TASK_STATUS_VALUES = ['running', 'completed', 'failed', 'killed'] as const;
type TaskStatus = (typeof TASK_STATUS_VALUES)[number];
type KillKind = 'user' | 'timeout' | 'output_cap' | 'shutdown';

const LIGHT_BLUE_BG = '\x1b[48;2;183;223;255m';
const LIGHT_BLUE_FG = '\x1b[38;2;11;70;110m';
const ANSI_RESET = '\x1b[0m';
function lightBlue(value: string): string {
  return `${LIGHT_BLUE_BG}${LIGHT_BLUE_FG}${value}${ANSI_RESET}`;
}
function textContent(text: string) {
  return [{ type: 'text' as const, text }];
}

/* ------------------------------------------------------------------ *
 * shared helpers (ported from upstream src/core/common.ts)
 * ------------------------------------------------------------------ */

function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'session';
}
function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}
function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
function truncateChars(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}
function normalizeTaskName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = compactWhitespace(stripMatchingQuotes(value));
  if (!normalized) return undefined;
  return truncateChars(normalized, 80);
}
function deriveTaskNameFromCommand(command: string): string {
  const normalized = compactWhitespace(stripMatchingQuotes(command));
  if (!normalized) return 'Background task';
  const packageScript = /^(npm|pnpm|yarn|bun)\s+(?:(run)\s+)?([^\s;&|]+)/.exec(normalized);
  if (packageScript) {
    const runner = packageScript[1] ?? 'npm';
    const run = packageScript[2] !== undefined ? ' run' : '';
    const script = packageScript[3] ?? '';
    return truncateChars(`${runner}${run} ${script}`, 48);
  }
  const words = normalized.split(/\s+/).slice(0, 5).join(' ');
  return truncateChars(words.length > 0 ? words : normalized, 48);
}
function taskDisplayName(task: {
  name?: string | undefined;
  description?: string | undefined;
  command?: string | undefined;
  id?: string | undefined;
}): string {
  const commandName =
    task.command && task.command.length > 0 ? deriveTaskNameFromCommand(task.command) : undefined;
  return (
    normalizeTaskName(task.name) ??
    normalizeTaskName(task.description) ??
    commandName ??
    task.id ??
    'Background task'
  );
}
function formatDuration(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) return `${String(minutes)}m${remSeconds > 0 ? `${String(remSeconds)}s` : ''}`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${String(hours)}h${remMinutes > 0 ? `${String(remMinutes)}m` : ''}`;
}
function normalizeMaxBytes(value: unknown, fallback = DEFAULT_LOG_BYTES): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(MAX_LOG_BYTES, raw));
}

type ShellDialect = 'cmd' | 'posix';
interface ShellInvocation {
  shell: string;
  args: string[];
  dialect: ShellDialect;
  windowsVerbatimArguments: boolean;
}
function cmdShellInvocation(command: string, shell: string): ShellInvocation {
  return { shell, args: ['/d', '/s', '/c', `"${command}"`], dialect: 'cmd', windowsVerbatimArguments: true };
}
function posixShellInvocation(command: string, shell: string): ShellInvocation {
  return { shell, args: ['-c', command], dialect: 'posix', windowsVerbatimArguments: false };
}
function shellInvocation(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ShellInvocation {
  if (platform !== 'win32') {
    const shell = env['SHELL'];
    return posixShellInvocation(command, shell && shell.length > 0 ? shell : '/bin/sh');
  }
  // Minimal Windows support: honor ComSpec unless PI_BG_SHELL=bash is requested.
  const requestedShell = env['PI_BG_SHELL'];
  if (requestedShell !== 'bash') {
    const comSpec = env['ComSpec'];
    return cmdShellInvocation(command, comSpec && comSpec.length > 0 ? comSpec : 'cmd.exe');
  }
  // bash requested: resolve bash.exe on PATH
  const pathValue = env['PATH'] ?? env['Path'] ?? env['path'] ?? '';
  for (const dir of pathValue.split(';').filter((entry) => entry.length > 0)) {
    for (const name of ['bash.exe', 'bash.com']) {
      const candidate = join(dir, name);
      try {
        const stats = statSync(candidate);
        if (stats.isFile()) return posixShellInvocation(command, candidate);
      } catch {
        /* keep looking */
      }
    }
  }
  throw new Error('PI_BG_SHELL=bash could not resolve bash.exe or bash.com on PATH');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

interface ParsedBgArgs {
  name?: string;
  command: string;
  isAgent: boolean;
}
function parseBgCommandArgs(args: string): ParsedBgArgs {
  let input = args.trim();
  let name: string | undefined;
  let isAgent = false;
  while (input) {
    let consumed = false;
    for (const prefix of ['--name=', '-n=']) {
      if (input.startsWith(prefix)) {
        const rest = input.slice(prefix.length);
        const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(rest.trimStart());
        if (!m || !m[1]) throw new Error(`${prefix.slice(0, -1)} requires a task name`);
        name = normalizeTaskName(m[1]);
        input = (m[2] ?? '').trimStart();
        consumed = true;
        break;
      }
    }
    if (consumed) continue;
    for (const prefix of ['--name', '-n']) {
      if (input === prefix || input.startsWith(`${prefix} `) || input.startsWith(`${prefix}\t`)) {
        const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(input.slice(prefix.length).trimStart());
        if (!m || !m[1]) throw new Error(`${prefix} requires a task name`);
        name = normalizeTaskName(m[1]);
        input = (m[2] ?? '').trimStart();
        consumed = true;
        break;
      }
    }
    if (consumed) continue;
    for (const flag of ['--agent', '--llm-agent']) {
      if (input === flag || input.startsWith(`${flag} `) || input.startsWith(`${flag}\t`)) {
        isAgent = true;
        input = input.slice(flag.length).trimStart();
        consumed = true;
        break;
      }
    }
    if (consumed) continue;
    for (const flag of ['--script', '--no-agent']) {
      if (input === flag || input.startsWith(`${flag} `) || input.startsWith(`${flag}\t`)) {
        isAgent = false;
        input = input.slice(flag.length).trimStart();
        consumed = true;
        break;
      }
    }
    if (consumed) continue;
    if (input === '--') {
      input = '';
      break;
    }
    if (input.startsWith('-- ')) {
      input = input.slice(3).trimStart();
      break;
    }
    break;
  }
  return name ? { name, command: input, isAgent } : { command: input, isAgent };
}

interface BgTaskSnapshot {
  id: string;
  name?: string | undefined;
  command: string;
  description?: string | undefined;
  status: TaskStatus;
  outputPath: string;
  cwd: string;
  startTime: number;
  endTime?: number | undefined;
  exitCode?: number | null | undefined;
  signal?: string | null | undefined;
  pid?: number | undefined;
  bytesWritten: number;
  isAgent: boolean;
  error?: string | undefined;
  notified: boolean;
  notifyOnCompletion: boolean;
  triggerOnCompletion: boolean;
  timeoutSeconds?: number | undefined;
}

interface BgTask extends Omit<BgTaskSnapshot, 'name'> {
  name: string;
  outputAbsPath: string;
  metadataAbsPath: string;
  child?: import('node:child_process').ChildProcess | undefined;
  stream?: import('node:fs').WriteStream | undefined;
  timeoutHandle?: NodeJS.Timeout | undefined;
  killKind?: KillKind | undefined;
  killSignalSent?: boolean | undefined;
  killEscalationTimer?: NodeJS.Timeout | undefined;
  finalized?: boolean | undefined;
  waiters: Array<() => void>;
}

interface StartTaskOptions {
  name?: string | undefined;
  description?: string | undefined;
  isAgent?: boolean | undefined;
  timeoutSeconds?: number | undefined;
  notifyOnCompletion?: boolean | undefined;
  triggerOnCompletion?: boolean | undefined;
}

function snapshot(task: BgTask): BgTaskSnapshot {
  return {
    id: task.id,
    name: taskDisplayName(task),
    command: task.command,
    description: task.description,
    status: task.status,
    outputPath: task.outputPath,
    cwd: task.cwd,
    startTime: task.startTime,
    endTime: task.endTime,
    exitCode: task.exitCode,
    signal: task.signal,
    pid: task.pid,
    bytesWritten: task.bytesWritten,
    isAgent: task.isAgent,
    error: task.error,
    notified: task.notified,
    notifyOnCompletion: task.notifyOnCompletion,
    triggerOnCompletion: task.triggerOnCompletion,
    timeoutSeconds: task.timeoutSeconds,
  };
}

function formatSnapshotList(tasks: BgTaskSnapshot[], now = Date.now()): string {
  if (tasks.length === 0) return 'No background tasks in this Pi extension runtime.';
  return tasks
    .map((task) => {
      const statusIcon =
        task.status === 'running'
          ? '▶'
          : task.status === 'completed'
            ? '✓'
            : task.status === 'killed'
              ? '■'
              : '✗';
      const age = formatDuration((task.endTime ?? now) - task.startTime);
      const code = task.exitCode !== undefined ? ` exit=${String(task.exitCode)}` : '';
      const pid = task.pid !== undefined ? ` pid=${String(task.pid)}` : '';
      const error = task.error ? ` error=${truncateChars(task.error, 80)}` : '';
      return `${statusIcon} ${task.id} ${task.status} ${age}${code}${pid} — ${truncateChars(taskDisplayName(task), COMMAND_PREVIEW_CHARS)}${error}\n    output: ${task.outputPath}`;
    })
    .join('\n');
}

async function boundedRead(
  filePath: string,
  maxBytes: number,
  tail: boolean,
): Promise<{ content: string; truncated: boolean; bytesRead: number; totalBytes: number }> {
  const stats = statSync(filePath);
  const totalBytes = stats.size;
  const bytesToRead = Math.min(totalBytes, maxBytes);
  if (bytesToRead === 0) return { content: '', truncated: false, bytesRead: 0, totalBytes };
  const file = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const position = tail ? Math.max(0, totalBytes - bytesToRead) : 0;
    const { bytesRead } = await file.read(buffer, 0, bytesToRead, position);
    return {
      content: buffer.subarray(0, bytesRead).toString('utf8'),
      truncated: totalBytes > bytesRead,
      bytesRead,
      totalBytes,
    };
  } finally {
    await file.close();
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------------------------------------------ *
 * task registry (ported from upstream src/core/registry.ts, shell only)
 * ------------------------------------------------------------------ */

function defaultTaskId(): string {
  return `b${randomBytes(4).toString('hex')}`;
}

interface RegistryOptions {
  onChange: () => void;
  sendCompletionNotification: (
    message: Parameters<ExtensionAPI['sendMessage']>[0],
    options?: { triggerTurn?: boolean; deliverAs?: 'steer' | 'followUp' | 'nextTurn' },
  ) => void;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  makeTaskId?: () => string;
}

class BackgroundTaskRegistry {
  private readonly tasks = new Map<string, BgTask>();
  private runtimeDir: { abs: string; display: string } | undefined;
  private shuttingDown = false;
  private readonly platform: NodeJS.Platform;
  private readonly env: NodeJS.ProcessEnv;
  private readonly makeTaskIdFn: () => string;
  private readonly now: () => number;
  private readonly maxRecentTasks: number;
  private readonly killGraceMs: number;
  private readonly stopWaitMs: number;
  private readonly onChange: () => void;
  private readonly sendCompletionNotification: RegistryOptions['sendCompletionNotification'];

  constructor(options: RegistryOptions) {
    this.platform = options.platform ?? process.platform;
    this.env = options.env ?? process.env;
    this.makeTaskIdFn = options.makeTaskId ?? defaultTaskId;
    this.now = Date.now;
    this.maxRecentTasks = MAX_RECENT_TASKS;
    this.killGraceMs = KILL_GRACE_MS;
    this.stopWaitMs = STOP_WAIT_MS;
    this.onChange = options.onChange;
    this.sendCompletionNotification = options.sendCompletionNotification;
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }
  setShuttingDown(value: boolean): void {
    this.shuttingDown = value;
  }
  allTasks(): BgTask[] {
    return [...this.tasks.values()];
  }
  snapshot(task: BgTask): BgTaskSnapshot {
    return snapshot(task);
  }
  async ensureRuntimeDir(ctx: ExtensionContext): Promise<{ abs: string; display: string }> {
    if (this.runtimeDir) return this.runtimeDir;
    const sessionId = sanitizePathSegment(ctx.sessionManager.getSessionId?.() ?? `session-${String(process.pid)}`);
    const runId = `${sessionId}-${String(process.pid)}`;
    const runtimeDirAbs = join(ctx.cwd, '.pi', 'tasks', runId);
    const runtimeDirDisplay = join('.pi', 'tasks', runId);
    await mkdir(runtimeDirAbs, { recursive: true });
    this.runtimeDir = { abs: runtimeDirAbs, display: runtimeDirDisplay };
    return this.runtimeDir;
  }

  async startTask(ctx: ExtensionContext, command: string, options: StartTaskOptions = {}): Promise<BgTask> {
    const normalizedCommand = command.trim();
    if (!normalizedCommand) throw new Error('Background command is empty');
    if (this.shuttingDown) throw new Error('Cannot start a background task while Pi is shutting down');

    const dir = await this.ensureRuntimeDir(ctx);
    const id = this.makeTaskIdFn();
    const outputAbsPath = join(dir.abs, `${id}.output`);
    const metadataAbsPath = join(dir.abs, `${id}.json`);
    const outputPath = join(dir.display, `${id}.output`);
    const timeoutSeconds =
      typeof options.timeoutSeconds === 'number' &&
      Number.isFinite(options.timeoutSeconds) &&
      options.timeoutSeconds > 0
        ? Math.floor(options.timeoutSeconds)
        : undefined;
    const taskName =
      normalizeTaskName(options.name) ??
      normalizeTaskName(options.description) ??
      deriveTaskNameFromCommand(normalizedCommand);
    const trimmedDescription = options.description?.trim();
    const description =
      trimmedDescription && trimmedDescription.length > 0 ? trimmedDescription : undefined;

    const task: BgTask = {
      id,
      name: taskName,
      command: normalizedCommand,
      description,
      status: 'running',
      outputPath,
      outputAbsPath,
      metadataAbsPath,
      cwd: ctx.cwd,
      startTime: this.now(),
      exitCode: undefined,
      pid: undefined,
      bytesWritten: 0,
      isAgent: options.isAgent ?? false,
      notified: false,
      notifyOnCompletion: options.notifyOnCompletion ?? true,
      triggerOnCompletion: options.triggerOnCompletion ?? false,
      timeoutSeconds,
      waiters: [],
    };
    this.tasks.set(id, task);

    const stream = createWriteStream(outputAbsPath, { flags: 'a', encoding: 'utf8' });
    task.stream = stream;
    stream.on('error', (error) => {
      task.error = `Output file write failed: ${error.message}`;
      if (task.status === 'running') {
        task.killKind = 'output_cap';
        try {
          this.requestKill(task, 'SIGTERM');
        } catch (killError) {
          void this.finalizeTask(
            task,
            'failed',
            null,
            undefined,
            `${task.error}; kill failed: ${killError instanceof Error ? killError.message : String(killError)}`,
          );
        }
      }
    });

    try {
      const invocation = shellInvocation(normalizedCommand, this.platform, this.env);
      const child = nodeSpawn(invocation.shell, invocation.args, {
        cwd: ctx.cwd,
        detached: this.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: this.env,
        windowsHide: true,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      } as SpawnOptions);

      task.child = child;
      task.pid = child.pid;

      child.stdout?.on('data', (data: Buffer) => {
        this.appendChildOutput(task, data);
      });
      child.stderr?.on('data', (data: Buffer) => {
        this.appendChildOutput(task, data);
      });

      child.on('error', (error) => {
        this.writeNotice(task, `\n[background task spawn error: ${error.message}]\n`);
        void this.finalizeTask(task, 'failed', null, undefined, error.message);
      });

      child.on('close', (code, signalName) => {
        let status: TaskStatus;
        let error: string | undefined;
        if (task.killKind === 'user' || task.killKind === 'shutdown') {
          status = 'killed';
        } else if (task.killKind === 'timeout') {
          status = 'failed';
          error = task.error ?? `Timed out after ${String(timeoutSeconds)}s`;
        } else if (task.killKind === 'output_cap') {
          status = 'failed';
          error = task.error ?? 'Output exceeded cap of 20MB';
        } else if ((code ?? 0) === 0) {
          status = 'completed';
        } else {
          status = 'failed';
          const exitCode = code === null ? 'null' : String(code);
          error = `Exited with code ${exitCode}${signalName ? ` (${signalName})` : ''}`;
        }
        void this.finalizeTask(task, status, code, signalName, error);
      });

      if (timeoutSeconds !== undefined) {
        task.timeoutHandle = setTimeout(() => {
          if (task.status !== 'running') return;
          task.killKind = 'timeout';
          task.error = `Timed out after ${String(timeoutSeconds)}s`;
          this.writeNotice(task, `\n[background task timeout: ${task.error}]\n`);
          try {
            this.requestKill(task, 'SIGTERM');
          } catch (error) {
            void this.finalizeTask(
              task,
              'failed',
              null,
              undefined,
              `${task.error}; kill failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }, timeoutSeconds * 1000);
      }

      await this.writeMetadata(task);
      this.onChange();
      return task;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.writeNotice(task, `\n[background task spawn exception: ${message}]\n`);
      await this.finalizeTask(task, 'failed', null, undefined, message);
      throw new Error(`Failed to start background task: ${message}`);
    }
  }

  resolveTask(idOrPrefix: string): BgTask {
    const id = idOrPrefix.trim();
    if (!id) throw new Error('Task ID is required');
    const exact = this.tasks.get(id);
    if (exact) return exact;
    const matches = [...this.tasks.values()].filter((task) => task.id.startsWith(id));
    const onlyMatch = matches[0];
    if (matches.length === 1 && onlyMatch) return onlyMatch;
    if (matches.length > 1)
      throw new Error(
        `Ambiguous task ID prefix "${id}": ${matches.map((task) => task.id).join(', ')}`,
      );
    throw new Error(`Unknown background task ID: ${id}`);
  }

  async stopTask(task: BgTask, kind: KillKind, reason?: string): Promise<BgTask> {
    if (task.status !== 'running') {
      throw new Error(`Task ${task.id} is ${task.status}, not running`);
    }
    task.killKind = kind;
    if (reason) task.error = reason;
    this.requestKill(task, 'SIGTERM');
    const stopped = await this.waitForEnd(task, this.stopWaitMs);
    if (!stopped) {
      throw new Error(
        `Task ${task.id} did not exit within ${formatDuration(this.stopWaitMs)} after cancellation`,
      );
    }
    return task;
  }

  async stopAllRunning(kind: KillKind, reason?: string): Promise<{ stopped: number; failures: string[] }> {
    const running = this.allTasks().filter((task) => task.status === 'running');
    const failures: string[] = [];
    let stopped = 0;
    await Promise.all(
      running.map(async (task) => {
        try {
          await this.stopTask(task, kind, reason);
          stopped++;
        } catch (error) {
          failures.push(
            `${taskDisplayName(task)} (${task.id}): ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );
    return { stopped, failures };
  }

  async getTaskLogs(
    task: BgTask,
    maxBytes: number,
    tail: boolean,
  ): Promise<{ text: string; details: BgLogsDetails }> {
    if (!existsSync(task.outputAbsPath)) {
      throw new Error(`Output file does not exist for ${task.id}: ${task.outputPath}`);
    }
    const read = await boundedRead(task.outputAbsPath, maxBytes, tail);
    const direction = tail ? 'tail' : 'head';
    let text = read.content.length > 0 ? read.content : '(no output yet)';
    if (read.truncated) {
      const omitted = read.totalBytes - read.bytesRead;
      const notice = `\n\n[Showing ${direction} ${read.bytesRead}B of ${read.totalBytes}B; ${omitted}B omitted. Full output: ${task.outputPath}]`;
      text = tail ? `${notice}\n\n${text}` : `${text}${notice}`;
    } else {
      text += `\n\n[Full output: ${task.outputPath}]`;
    }
    return {
      text,
      details: {
        task: snapshot(task),
        path: task.outputPath,
        bytesRead: read.bytesRead,
        truncated: read.truncated,
        tail,
      },
    };
  }

  private appendChildOutput(task: BgTask, data: Buffer): void {
    task.bytesWritten += data.length;
    this.writeToStream(task, data);
    if (task.bytesWritten > MAX_OUTPUT_BYTES && task.status === 'running' && task.killKind === undefined) {
      task.killKind = 'output_cap';
      task.error = `Output exceeded cap of 20MB`;
      this.writeNotice(task, `\n[background task output cap exceeded]\n`);
      try {
        this.requestKill(task, 'SIGTERM');
      } catch (error) {
        void this.finalizeTask(
          task,
          'failed',
          null,
          undefined,
          `${task.error}; kill failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private writeToStream(task: BgTask, buffer: Buffer): void {
    if (task.stream && !task.stream.destroyed) {
      task.stream.write(buffer);
    }
  }

  private writeNotice(task: BgTask, text: string): void {
    this.writeToStream(task, Buffer.from(text, 'utf8'));
  }

  private async writeMetadata(task: BgTask): Promise<void> {
    await writeJsonAtomic(task.metadataAbsPath, snapshot(task));
  }

  private requestKill(task: BgTask, signal: NodeJS.Signals = 'SIGTERM'): void {
    if (task.status !== 'running') {
      throw new Error(`Task ${task.id} is ${task.status}, not running`);
    }
    if (!task.child) throw new Error(`Task ${task.id} has no child process handle`);
    if (!task.pid) throw new Error(`Task ${task.id} has no process id`);
    if (task.killSignalSent && signal === 'SIGTERM') return;

    const errors: string[] = [];
    let killed = false;
    try {
      process.kill(-task.pid, signal); // negative pid = process group (we detached)
      killed = true;
    } catch (error) {
      errors.push(
        `process group kill failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!killed) {
      try {
        task.child.kill(signal);
        killed = true;
      } catch (error) {
        errors.push(`child kill failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!killed) {
      throw new Error(`Could not kill task ${task.id}: ${errors.join('; ')}`);
    }
    task.killSignalSent = true;
    if (signal === 'SIGKILL') return;
    if (task.killEscalationTimer !== undefined) return;
    task.killEscalationTimer = setTimeout(() => {
      task.killEscalationTimer = undefined;
      if (task.status !== 'running') return;
      try {
        this.requestKill(task, 'SIGKILL');
      } catch (error) {
        task.error = `SIGKILL failed: ${error instanceof Error ? error.message : String(error)}`;
        void this.writeMetadata(task).catch(() => undefined);
      }
    }, this.killGraceMs).unref();
  }

  private waitForEnd(task: BgTask, timeoutMs: number): Promise<boolean> {
    if (task.status !== 'running') return Promise.resolve(true);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const idx = task.waiters.indexOf(done);
        if (idx >= 0) task.waiters.splice(idx, 1);
        resolve(false);
      }, timeoutMs);
      const done = () => {
        clearTimeout(timeout);
        resolve(true);
      };
      task.waiters.push(done);
    });
  }

  private notifyCompletion(task: BgTask): void {
    if (!task.notifyOnCompletion || task.notified || this.shuttingDown) return;
    task.notified = true;
    const exit = task.exitCode === undefined ? '' : `\n  <exit-code>${String(task.exitCode)}</exit-code>`;
    const error = task.error ? `\n  <error>${escapeXml(task.error)}</error>` : '';
    const taskName = taskDisplayName(task);
    const guidance =
      'Terminal state and output metadata are durable. Do not call bg_status to reconfirm; use bg_logs only if output is needed.';
    const content = [
      '<background-task-notification>',
      `  <task-id>${task.id}</task-id>`,
      `  <task-name>${escapeXml(taskName)}</task-name>`,
      `  <status>${task.status}</status>`,
      exit,
      error,
      `  <output-file>${escapeXml(task.outputPath)}</output-file>`,
      `  <summary>${escapeXml(`Background task ${JSON.stringify(taskName)} ${task.status}`)}</summary>`,
      `  <guidance>${escapeXml(guidance)}</guidance>`,
      '</background-task-notification>',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      this.sendCompletionNotification(
        {
          customType: 'background-task-notification',
          content,
          display: true,
          details: snapshot(task),
        },
        { deliverAs: 'followUp', triggerTurn: task.triggerOnCompletion },
      );
    } catch (error) {
      task.notified = false;
      throw new Error(
        `Failed to send background task notification for ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async finalizeTask(
    task: BgTask,
    status: TaskStatus,
    exitCode: number | null,
    signal?: string | null,
    error?: string,
  ): Promise<void> {
    if (task.finalized) return;
    task.finalized = true;
    if (task.timeoutHandle) clearTimeout(task.timeoutHandle);
    if (task.killEscalationTimer !== undefined) {
      clearTimeout(task.killEscalationTimer);
      task.killEscalationTimer = undefined;
    }
    task.exitCode = exitCode;
    task.signal = signal ?? null;
    try {
      if (task.stream && !task.stream.destroyed) await closeAndFsyncOutputStream(task.stream);
    } catch (finalizeError) {
      status = 'failed';
      const message = finalizeError instanceof Error ? finalizeError.message : String(finalizeError);
      error = error ? `${error}; final output durability failed: ${message}` : `Final output durability failed: ${message}`;
    }
    task.endTime = this.now();
    if (error) task.error = error;
    task.status = status;
    try {
      await this.writeMetadata(task);
    } catch (metadataError) {
      task.status = 'failed';
      task.error = `Terminal metadata write failed: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`;
      await this.writeMetadata(task).catch(() => undefined);
    }
    for (const waiter of task.waiters.splice(0)) waiter();
    this.onChange();
    try {
      this.notifyCompletion(task);
    } catch (notificationError) {
      console.error(
        `[background-tasks] notification failed for ${task.id}:`,
        notificationError,
      );
    }
    this.pruneOldTasks();
  }

  private pruneOldTasks(): void {
    if (this.tasks.size <= this.maxRecentTasks) return;
    const oldest = [...this.tasks.values()]
      .filter((task) => task.status !== 'running')
      .sort((a, b) => a.startTime - b.startTime);
    for (const task of oldest.slice(0, this.tasks.size - this.maxRecentTasks)) {
      this.tasks.delete(task.id);
    }
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await import('node:fs/promises').then(({ rename }) => rename(tmp, path));
}

function closeAndFsyncOutputStream(stream: import('node:fs').WriteStream): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      stream.off('error', fail);
      stream.off('close', finish);
      stream.off('finish', finish);
      resolvePromise();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      stream.off('close', finish);
      reject(error);
    };
    stream.once('close', finish);
    stream.once('finish', finish);
    stream.once('error', fail);
    stream.end();
  });
}

/* ------------------------------------------------------------------ *
 * tool param schemas
 * ------------------------------------------------------------------ */

const BgRunParams = Type.Object({
  name: Type.String({
    description:
      'Short human-readable task name shown in the bg footer. Required; use 2-6 words, not the raw command.',
  }),
  command: Type.String({ description: 'Shell command to start in the background' }),
  isAgent: Type.Boolean({
    description:
      'Set true only when the background task launches an LLM/agent process; set false for scripts, tests, dev servers, sleeps, and ordinary shell commands.',
  }),
  description: Type.Optional(Type.String({ description: 'Optional longer description' })),
  timeoutSeconds: Type.Optional(
    Type.Number({ description: 'Optional timeout in seconds; the task is killed when exceeded' }),
  ),
  notifyOnCompletion: Type.Optional(
    Type.Boolean({
      description:
        'Deliver a background-task-notification on terminal state. Default true.',
    }),
  ),
  triggerOnCompletion: Type.Optional(
    Type.Boolean({
      description:
        'Start a follow-up agent turn when the task finishes. Default true.',
    }),
  ),
});
type BgRunParamsValue = Static<typeof BgRunParams>;

const BgStatusParams = Type.Object({
  taskId: Type.Optional(Type.String({ description: 'Task ID to inspect; omit to list all' })),
});
type BgStatusParamsValue = Static<typeof BgStatusParams>;

const BgLogsParams = Type.Object({
  taskId: Type.String({ description: 'Task ID to read output from' }),
  maxBytes: Type.Optional(
    Type.Number({ description: `Max bytes to read; capped at ${MAX_LOG_BYTES}` }),
  ),
  tail: Type.Optional(Type.Boolean({ description: 'Read the tail (default true) or head' })),
});
type BgLogsParamsValue = Static<typeof BgLogsParams>;

const BgKillParams = Type.Object({
  taskId: Type.String({ description: 'Task ID to stop' }),
});
type BgKillParamsValue = Static<typeof BgKillParams>;

interface BgRunDetails {
  task: BgTaskSnapshot;
}
interface BgStatusDetails {
  tasks: BgTaskSnapshot[];
}
interface BgLogsDetails {
  task: BgTaskSnapshot;
  path: string;
  bytesRead: number;
  truncated: boolean;
  tail: boolean;
}
interface BgKillDetails {
  task: BgTaskSnapshot;
  message: string;
}

function deriveCompletionDeliveryGuidance(
  notifyOnCompletion: boolean,
  triggerOnCompletion: boolean,
): { text: string } {
  if (notifyOnCompletion && triggerOnCompletion) {
    return {
      text: [
        'Terminal notification: enabled.',
        'Automatic follow-up turn: enabled.',
        'Next action: do not poll or sleep merely to wait; continue only independent useful work, otherwise end this turn and wait for <background-task-notification>.',
      ].join('\n'),
    };
  }
  if (notifyOnCompletion) {
    return {
      text: [
        'Terminal notification: enabled.',
        'Automatic follow-up turn: disabled. The terminal notification will be delivered, but it will not start an agent turn.',
        'Next action: automatic wake-up was explicitly disabled; use bg_status/bg_logs only when deliberate monitoring is required, without tight polling.',
      ].join('\n'),
    };
  }
  return {
    text: [
      'Terminal notification: disabled.',
      'Automatic follow-up turn: disabled.',
      'Next action: completion delivery was explicitly disabled; use bg_status/bg_logs only for deliberate manual monitoring, without tight polling.',
    ].join('\n'),
  };
}

/* ------------------------------------------------------------------ *
 * extension entry
 * ------------------------------------------------------------------ */

export default function backgroundTaskRunnerExtension(pi: ExtensionAPI): void {
  const seenTaskIds = new Set<string>();
  let currentCtx: ExtensionContext | undefined;
  let statusInterval: NodeJS.Timeout | undefined;

  const registry = new BackgroundTaskRegistry({
    onChange: () => {
      updateUi();
    },
    sendCompletionNotification: (message, options) => {
      pi.sendMessage(message, options);
    },
  });

  function unseenFinishedTasks() {
    return registry
      .allTasks()
      .filter((task) => task.status !== 'running' && !seenTaskIds.has(task.id));
  }

  function clearFinishedNotices(ctx = currentCtx): number {
    const unseen = unseenFinishedTasks();
    for (const task of unseen) seenTaskIds.add(task.id);
    updateUi(ctx);
    return unseen.length;
  }

  function notifyClearFinishedNotices(ctx: ExtensionContext): void {
    currentCtx = ctx;
    const cleared = clearFinishedNotices(ctx);
    if (!ctx.hasUI) return;
    ctx.ui.notify(
      cleared > 0
        ? `Cleared ${String(cleared)} finished background task notice${cleared === 1 ? '' : 's'}.`
        : 'No finished background task notices to clear.',
      cleared > 0 ? 'info' : 'warning',
    );
  }

  function updateUi(ctx = currentCtx): void {
    if (registry.isShuttingDown() || !ctx) return;
    try {
      if (!ctx.hasUI) return;
      const allTasks = registry.allTasks();
      const running = allTasks.filter((task) => task.status === 'running');
      const unseenFailed = allTasks.filter(
        (task) => task.status === 'failed' && !seenTaskIds.has(task.id),
      );
      const unseenStopped = allTasks.filter(
        (task) => task.status === 'killed' && !seenTaskIds.has(task.id),
      );
      const unseenDone = allTasks.filter(
        (task) => task.status === 'completed' && !seenTaskIds.has(task.id),
      );
      const unseenFinishedCount = unseenFailed.length + unseenStopped.length + unseenDone.length;
      ctx.ui.setWidget('background-tasks', undefined);
      if (running.length === 0 && unseenFinishedCount === 0) {
        ctx.ui.setStatus('background-tasks', undefined);
        return;
      }
      const parts: string[] = [];
      if (running.length > 0) parts.push(`${String(running.length)} running`);
      if (unseenFailed.length > 0) parts.push(`${String(unseenFailed.length)} failed`);
      if (unseenStopped.length > 0) parts.push(`${String(unseenStopped.length)} stopped`);
      if (unseenDone.length > 0) parts.push(`${String(unseenDone.length)} done`);
      const entryHint = unseenFinishedCount > 0 ? '· /bg-clear' : '';
      const label = ` bg ${parts.join(' · ')} ${entryHint}`.trim();
      ctx.ui.setStatus('background-tasks', lightBlue(label));
    } catch (error) {
      console.error(
        `[background-tasks] UI update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      currentCtx = undefined;
    }
  }

  async function startTask(
    ctx: ExtensionContext,
    command: string,
    options: StartTaskOptions = {},
  ): Promise<BgTask> {
    currentCtx = ctx;
    return registry.startTask(ctx, command, options);
  }

  pi.registerMessageRenderer<BgTaskSnapshot>(
    'background-task-notification',
    (message, _options, theme) => {
      const task = message.details;
      const status = task?.status ?? 'completed';
      const color: ThemeColor =
        status === 'completed'
          ? 'success'
          : status === 'failed'
            ? 'error'
            : status === 'killed'
              ? 'warning'
              : 'accent';
      const id = task?.id ?? 'background task';
      const name = task ? taskDisplayName(task) : 'Background task';
      const output = task?.outputPath ? `\n${theme.fg('dim', `Output: ${task.outputPath}`)}` : '';
      const error = task?.error ? `\n${theme.fg('error', task.error)}` : '';
      return new Text(
        `${theme.fg(color, `[bg ${status}]`)} ${theme.fg('accent', name)} ${theme.fg('dim', `(${id})`)}${output}${error}`,
        0,
        0,
      );
    },
  );

  pi.on('session_start', async (_event, ctx) => {
    registry.setShuttingDown(false);
    currentCtx = ctx;
    await registry.ensureRuntimeDir(ctx);
    updateUi(ctx);
    if (statusInterval) clearInterval(statusInterval);
    statusInterval = setInterval(() => {
      updateUi();
    }, STATUS_INTERVAL_MS);
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    registry.setShuttingDown(true);
    currentCtx = undefined;
    if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = undefined;
    }
    try {
      const running = registry.allTasks().filter((task) => task.status === 'running');
      if (running.length === 0) return;
      const failures: string[] = [];
      await Promise.all(
        running.map(async (task) => {
          try {
            await registry.stopTask(task, 'shutdown', 'Killed during Pi session shutdown/reload');
          } catch (error) {
            failures.push(
              `${task.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }),
      );
      if (failures.length > 0 && ctx.hasUI) {
        ctx.ui.notify(`Background task cleanup failed:\n${failures.join('\n')}`, 'error');
      }
    } finally {
      /* nothing to close */
    }
  });

  pi.registerCommand('bg', {
    description:
      'Start a shell command as a tracked background task: /bg [--agent] [--name "Task name"] <command>',
    handler: async (args, ctx) => {
      try {
        const parsed = parseBgCommandArgs(args);
        const taskOptions: StartTaskOptions = {
          isAgent: parsed.isAgent,
          notifyOnCompletion: true,
          triggerOnCompletion: false,
        };
        if (parsed.name !== undefined) taskOptions.name = parsed.name;
        const task = await startTask(ctx, parsed.command, taskOptions);
        ctx.ui.notify(
          `Started ${taskDisplayName(task)} (${task.id})\nOutput: ${task.outputPath}\nCommand: ${task.command}`,
          'info',
        );
      } catch (error) {
        ctx.ui.notify(
          `Background task failed to start: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
      }
    },
  });

  pi.registerCommand('jobs', {
    description: 'List running and recent background tasks',
    handler: (_args, ctx) => {
      currentCtx = ctx;
      ctx.ui.notify(
        formatSnapshotList(registry.allTasks().map((task) => registry.snapshot(task))),
        'info',
      );
      updateUi(ctx);
      return Promise.resolve();
    },
  });

  pi.registerCommand('logs', {
    description: 'Show bounded output from a background task: /logs <id> [maxBytes]',
    getArgumentCompletions: (prefix) => {
      const matches = registry
        .allTasks()
        .filter((task) => task.id.startsWith(prefix.trim()))
        .slice(0, 20)
        .map((task) => ({
          value: task.id,
          label: `${task.id} ${taskDisplayName(task)}`,
          description: `${task.status} — ${truncateChars(task.command, 60)}`,
        }));
      return matches.length > 0 ? matches : null;
    },
    handler: async (args, ctx) => {
      try {
        currentCtx = ctx;
        const [id, bytes] = args.trim().split(/\s+/, 2);
        const task = registry.resolveTask(id ?? '');
        const maxBytes = normalizeMaxBytes(Number(bytes), DEFAULT_LOG_BYTES);
        const logs = await registry.getTaskLogs(task, maxBytes, true);
        ctx.ui.notify(logs.text, 'info');
      } catch (error) {
        ctx.ui.notify(
          `Background logs error: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
      }
    },
  });

  pi.registerCommand('kill', {
    description: 'Stop a running background task: /kill <id>',
    getArgumentCompletions: (prefix) => {
      const matches = registry
        .allTasks()
        .filter((task) => task.status === 'running' && task.id.startsWith(prefix.trim()))
        .slice(0, 20)
        .map((task) => ({
          value: task.id,
          label: `${task.id} ${taskDisplayName(task)}`,
          description: truncateChars(task.command, 70),
        }));
      return matches.length > 0 ? matches : null;
    },
    handler: async (args, ctx) => {
      try {
        currentCtx = ctx;
        const task = registry.resolveTask(args.trim());
        await registry.stopTask(task, 'user');
        ctx.ui.notify(
          `Killed ${taskDisplayName(task)} (${task.id}). Output: ${task.outputPath}`,
          'info',
        );
        updateUi(ctx);
      } catch (error) {
        ctx.ui.notify(
          `Background kill error: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
      }
    },
  });

  pi.registerCommand('bg-clear', {
    description: 'Clear finished background task footer notices',
    handler: (_args, ctx) => {
      notifyClearFinishedNotices(ctx);
      return Promise.resolve();
    },
  });

  pi.registerTool<typeof BgRunParams, BgRunDetails>({
    name: 'bg_run',
    label: 'Background Run',
    description: `Start a named long-running shell command in the background and return immediately with a task ID and output path. By default, completed, failed, or killed terminal state is delivered automatically as <background-task-notification> and starts a follow-up agent turn; do not sleep or poll merely to wait. Output is written to .pi/tasks and model-visible logs are bounded.`,
    promptSnippet:
      'Start a named long-running shell command; default terminal notification wakes a follow-up turn, so yield instead of polling',
    promptGuidelines: [
      'Use bg_run instead of bash for commands expected to run for a long time, such as test suites, dev servers, watchers, or builds.',
      'Always set isAgent: true only when the background task launches an LLM/agent process; set isAgent: false for scripts, tests, dev servers, sleeps, and ordinary shell commands.',
      'When using bg_run, always set name to a concise 2-6 word human-readable label for the footer task dock; do not use the raw command as the name unless it is already short and meaningful.',
      'bg_run returns immediately. With notifyOnCompletion:true and triggerOnCompletion:true (both defaults), completed, failed, or killed terminal state is delivered as <background-task-notification> and automatically starts a follow-up agent turn.',
      'After a default bg_run launch, continue only independent useful work that does not merely wait for the task; otherwise briefly acknowledge it if useful, then end the current turn. Do not call sleep, bg_status, or bg_logs merely to wait; the terminal notification will wake you.',
      'Treat <background-task-notification> as durable terminal truth. Do not call bg_status to reconfirm it; call bg_logs only when the task output is needed.',
      'Use bg_status/bg_logs only when the user explicitly requests an update, automatic notification or wake-up was deliberately disabled, there is concrete evidence the task is hung, or a terminal notification arrived and output details are needed.',
      'Do not set notifyOnCompletion:false or triggerOnCompletion:false unless intentionally opting out of automatic completion handling.',
    ],
    parameters: BgRunParams,
    prepareArguments(args): BgRunParamsValue {
      if (!args || typeof args !== 'object') throw new Error('bg_run arguments must be an object');
      const input = args as Record<string, unknown>;
      if (typeof input.command !== 'string') throw new Error('bg_run requires command string');
      if (typeof input.isAgent !== 'boolean') {
        throw new Error(
          'bg_run requires isAgent boolean. Set true only for LLM/agent tasks; set false for scripts, tests, servers, sleeps, and ordinary shell commands.',
        );
      }
      const prepared: BgRunParamsValue = {
        command: input.command,
        name:
          normalizeTaskName(input.name) ??
          normalizeTaskName(input.description) ??
          deriveTaskNameFromCommand(input.command),
        isAgent: input.isAgent,
      };
      if (typeof input.description === 'string') prepared.description = input.description;
      if (typeof input.timeoutSeconds === 'number') prepared.timeoutSeconds = input.timeoutSeconds;
      if (typeof input.notifyOnCompletion === 'boolean')
        prepared.notifyOnCompletion = input.notifyOnCompletion;
      if (typeof input.triggerOnCompletion === 'boolean')
        prepared.triggerOnCompletion = input.triggerOnCompletion;
      return prepared;
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (typeof params.isAgent !== 'boolean') {
        throw new Error(
          'bg_run requires isAgent boolean. Set true only for LLM/agent tasks; set false for scripts, tests, servers, sleeps, and ordinary shell commands.',
        );
      }
      const taskOptions: StartTaskOptions = {
        name: params.name,
        isAgent: params.isAgent,
        notifyOnCompletion: params.notifyOnCompletion ?? true,
        triggerOnCompletion: params.triggerOnCompletion ?? true,
      };
      if (params.description !== undefined) taskOptions.description = params.description;
      if (params.timeoutSeconds !== undefined) taskOptions.timeoutSeconds = params.timeoutSeconds;
      const task = await startTask(ctx, params.command, taskOptions);
      const completionDelivery = deriveCompletionDeliveryGuidance(
        task.notifyOnCompletion,
        task.triggerOnCompletion,
      );
      return {
        content: textContent(
          `Started background task ${taskDisplayName(task)} (${task.id})\nStatus: ${task.status}\nPID: ${String(task.pid ?? 'unknown')}\nOutput: ${task.outputPath}\n${completionDelivery.text}`,
        ),
        details: { task: registry.snapshot(task) },
      };
    },
    renderCall(args, theme) {
      return new Text(
        `${theme.fg('toolTitle', theme.bold('bg_run '))}${theme.fg('muted', truncateChars(taskDisplayName(args), COMMAND_PREVIEW_CHARS))}`,
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const { task } = result.details;
      return new Text(
        `${theme.fg('success', '✓ started')} ${theme.fg('accent', taskDisplayName(task))} ${theme.fg('dim', `(${task.id})`)}\n${theme.fg('dim', `Output: ${task.outputPath}`)}`,
        0,
        0,
      );
    },
  });

  pi.registerTool<typeof BgStatusParams, BgStatusDetails>({
    name: 'bg_status',
    label: 'Background Status',
    description:
      'Inspect one background task or list all running/recent background tasks. This is a point-in-time inspection tool, not a waiting primitive.',
    promptSnippet:
      'Inspect point-in-time status for one or all background tasks; never poll it as a wait loop',
    promptGuidelines: [
      'Use bg_status for deliberate point-in-time inspection, not as a waiting primitive.',
      'A running result is not an instruction to poll again. Do not repeatedly call bg_status while an automatic terminal notification is pending.',
      'Use bg_status when the user explicitly requests an update, automatic completion handling was disabled, or concrete evidence suggests a task is hung; terminal notifications do not need reconfirmation.',
    ],
    parameters: BgStatusParams,
    execute(_toolCallId, params) {
      const selected = params.taskId ? [registry.resolveTask(params.taskId)] : registry.allTasks();
      const snapshots = selected.map((task) => registry.snapshot(task));
      return Promise.resolve({
        content: textContent(formatSnapshotList(snapshots)),
        details: { tasks: snapshots },
      });
    },
    renderCall(args, theme) {
      return new Text(
        `${theme.fg('toolTitle', theme.bold('bg_status'))}${args.taskId ? ` ${theme.fg('accent', args.taskId)}` : ''}`,
        0,
        0,
      );
    },
    renderResult: renderPlainResult,
  });

  pi.registerTool<typeof BgLogsParams, BgLogsDetails>({
    name: 'bg_logs',
    label: 'Background Logs',
    description: `Read bounded output from a background task for deliberate inspection; this is not a waiting primitive. Output is capped for model safety and points to the full output file when truncated.`,
    promptSnippet: 'Read bounded task output when needed; never tail it repeatedly as a wait loop',
    promptGuidelines: [
      'Use bg_logs with a modest maxBytes value only when task output is needed, without flooding context.',
      'Do not repeatedly call bg_logs to wait for completion while an automatic terminal notification is pending.',
      'Use bg_status first only when a deliberate inspection requires the current task state; do not reconfirm a terminal notification.',
    ],
    parameters: BgLogsParams,
    async execute(_toolCallId, params) {
      const task = registry.resolveTask(params.taskId);
      const logs = await registry.getTaskLogs(
        task,
        normalizeMaxBytes(params.maxBytes),
        params.tail ?? true,
      );
      return {
        content: textContent(logs.text),
        details: logs.details,
      };
    },
    renderCall(args, theme) {
      return new Text(
        `${theme.fg('toolTitle', theme.bold('bg_logs '))}${theme.fg('accent', args.taskId)}`,
        0,
        0,
      );
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details;
      let text = `${theme.fg('accent', taskDisplayName(details.task))} ${theme.fg('dim', `(${details.task.id})`)} ${theme.fg('muted', details.tail ? 'tail' : 'head')}`;
      if (details.truncated) text += theme.fg('warning', ' (truncated)');
      text += `\n${theme.fg('dim', `Full output: ${details.path}`)}`;
      if (expanded) {
        const output = result.content
          .map((content) => (content.type === 'text' ? content.text : '[image content]'))
          .join('\n');
        text += `\n${theme.fg('toolOutput', output.split('\n').slice(0, 30).join('\n'))}`;
      }
      return new Text(text, 0, 0);
    },
  });

  pi.registerTool<typeof BgKillParams, BgKillDetails>({
    name: 'bg_kill',
    label: 'Background Kill',
    description:
      'Stop a running background task by ID. Fails loudly if the task is unknown or already finished.',
    promptSnippet: 'Stop a running background task by ID',
    promptGuidelines: [
      'Use bg_kill when the user asks to stop a background task or when a bg_run command is no longer needed.',
    ],
    parameters: BgKillParams,
    async execute(_toolCallId, params) {
      const task = registry.resolveTask(params.taskId);
      await registry.stopTask(task, 'user');
      const message = `Killed background task ${taskDisplayName(task)} (${task.id}). Output: ${task.outputPath}`;
      return {
        content: textContent(message),
        details: { task: registry.snapshot(task), message },
      };
    },
    renderCall(args, theme) {
      return new Text(
        `${theme.fg('toolTitle', theme.bold('bg_kill '))}${theme.fg('accent', args.taskId)}`,
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const { task } = result.details;
      return new Text(
        `${theme.fg('warning', '■ killed')} ${theme.fg('accent', taskDisplayName(task))} ${theme.fg('dim', `(${task.id})`)}\n${theme.fg('dim', `Output: ${task.outputPath}`)}`,
        0,
        0,
      );
    },
  });
}

function renderPlainResult(
  result: { content: ReadonlyArray<{ type: string; text?: string }> },
  options: { expanded: boolean },
  theme: Theme,
) {
  const text = result.content
    .map((c) => (c.type === 'text' ? c.text : '[image content]'))
    .join('\n');
  if (!options.expanded) {
    return new Text(
      theme.fg('muted', text.split('\n').slice(0, 8).join('\n')),
      0,
      0,
    );
  }
  return new Text(theme.fg('toolOutput', text), 0, 0);
}
