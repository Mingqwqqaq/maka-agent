import {
  redactReversibleStreamingSuffix,
  redactSecrets,
  redactStableStreamingSuffix,
} from './redact.js';

/**
 * Incremental state for display redaction.
 *
 * Secret values cannot cross a line break. Contextual openers may be followed by
 * arbitrary whitespace, though, so an unfinished `Authorization:` or `api_key:`
 * opener and its line are retained until a value or invalidating text arrives.
 * Every earlier complete line is then immutable and may be cached permanently.
 *
 * Assistant/thinking owners configure their existing display cap as the
 * recovery window. Direct oracle-only callers may omit it to retain exact,
 * uncapped semantics for arbitrary inputs.
 */
export interface StreamingDisplayRedactionState {
  /** Safe settled display characters retained by the incremental cache. */
  readonly settledChars: number;
  /** Raw mutable-suffix characters retained privately by this module. */
  readonly pendingChars: number;
}

interface PrivateStreamingDisplayRedactionState {
  readonly settledText: string;
  readonly pendingRaw: string;
  readonly continuationTerminator?: RegExp;
  readonly maxRecoveryChars: number;
  readonly recovery: 'head' | 'tail';
  readonly overflow?: ReversibleOverflow;
}

interface ReversibleOverflow {
  readonly sourceHead: string;
  readonly sourceTail: string;
  readonly compactedToken: string;
  readonly continuationChars: RegExp;
}

export interface StreamingDisplayRedactionOptions {
  /** Existing owner display cap plus one; omit only for uncapped oracle use. */
  readonly maxRecoveryChars?: number;
  readonly recovery?: 'head' | 'tail';
}

const DEFAULT_MAX_RECOVERY_CHARS = Number.POSITIVE_INFINITY;

const PRIVATE_STATE = new WeakMap<
  StreamingDisplayRedactionState,
  PrivateStreamingDisplayRedactionState
>();

export function createStreamingDisplayRedactionState(
  options: StreamingDisplayRedactionOptions = {},
): StreamingDisplayRedactionState {
  return stateFor('', '', undefined, {
    maxRecoveryChars: options.maxRecoveryChars ?? DEFAULT_MAX_RECOVERY_CHARS,
    recovery: options.recovery ?? 'head',
  });
}

export interface StreamingDisplayRedactionResult {
  readonly text: string;
  readonly redacted: boolean;
  readonly state: StreamingDisplayRedactionState;
}

/**
 * Append one raw stream delta while remaining exactly equivalent to applying
 * `redactSecrets` to every complete source prefix.
 *
 * `previousText` is only used to bootstrap legacy/direct callers that do not
 * yet carry state. Stream owners should pass the returned state on every call.
 */
export function appendStreamingDisplayRedaction(
  previousText: string,
  rawDelta: string,
  state?: StreamingDisplayRedactionState,
): StreamingDisplayRedactionResult {
  const privateState = state === undefined ? undefined : PRIVATE_STATE.get(state);
  const settledText = privateState?.settledText ?? '';
  const maxRecoveryChars = privateState?.maxRecoveryChars ?? DEFAULT_MAX_RECOVERY_CHARS;
  const recovery = privateState?.recovery ?? 'head';
  let previousPendingRaw = privateState?.pendingRaw ?? previousText;
  let overflow = privateState?.overflow;
  let delta = rawDelta;
  let continuationTerminator = privateState?.continuationTerminator;
  if (continuationTerminator !== undefined) {
    const terminatorIndex = delta.search(continuationTerminator);
    if (terminatorIndex < 0) {
      return {
        text: settledText,
        redacted: delta.length > 0,
        state: stateFor(settledText, '', continuationTerminator, {
          maxRecoveryChars,
          recovery,
        }),
      };
    }
    delta = delta.slice(terminatorIndex);
    continuationTerminator = undefined;
  }

  if (overflow !== undefined) {
    const nextOverflow = {
      sourceHead: (overflow.sourceHead + delta).slice(0, maxRecoveryChars),
      sourceTail: (overflow.sourceTail + delta).slice(-maxRecoveryChars),
      compactedToken: overflow.compactedToken,
      continuationChars: overflow.continuationChars,
    };
    const representative = previousPendingRaw + delta;
    if (reversibleInvalidated(delta, overflow.continuationChars)) {
      previousPendingRaw = recovery === 'head'
        ? overflow.sourceHead + delta
        : overflow.sourceHead + nextOverflow.sourceTail;
      delta = '';
      overflow = undefined;
    } else {
      overflow = nextOverflow;
    }
  }

  const pending = previousPendingRaw + delta;
  const stableSuffix = redactStableStreamingSuffix(pending);
  if (stableSuffix !== undefined) {
    return {
      text: settledText + stableSuffix.text,
      redacted: true,
      state: stateFor(settledText, stableSuffix.compactedInput, undefined, {
        maxRecoveryChars,
        recovery,
      }),
    };
  }
  const reversibleSuffix = pending.length > maxRecoveryChars
    ? redactReversibleStreamingSuffix(pending)
    : undefined;
  if (reversibleSuffix !== undefined) {
    const nextOverflow = overflow ?? {
      sourceHead: pending.slice(0, maxRecoveryChars),
      sourceTail: pending.slice(-maxRecoveryChars),
      compactedToken: reversibleSuffix.compactedToken,
      continuationChars: reversibleSuffix.continuationChars,
    };
    return {
      text: settledText + redactSecrets(reversibleSuffix.compactedInput),
      redacted: true,
      state: stateFor(settledText, reversibleSuffix.compactedInput, undefined, {
        maxRecoveryChars,
        recovery,
        overflow: nextOverflow,
      }),
    };
  }
  const lastLineBreak = pending.lastIndexOf('\n');
  const pendingContextStart = contextualTailStart(pending, lastLineBreak);
  const settlementLineBreak = pendingContextStart === undefined
    ? lastLineBreak
    : pending.lastIndexOf('\n', Math.max(0, pendingContextStart - 1));

  const completedRaw = settlementLineBreak < 0 ? '' : pending.slice(0, settlementLineBreak + 1);
  const pendingRaw = settlementLineBreak < 0 ? pending : pending.slice(settlementLineBreak + 1);
  const redactedCompleted = completedRaw ? redactSecrets(completedRaw) : '';
  const redactedPending = redactSecrets(pendingRaw);
  const nextSettledText = settledText + redactedCompleted;

  return {
    text: nextSettledText + redactedPending,
    redacted:
      redactedCompleted !== completedRaw
      || redactedPending !== pendingRaw,
    state: stateFor(nextSettledText, pendingRaw, undefined, {
      maxRecoveryChars,
      recovery,
    }),
  };
}

function reversibleInvalidated(delta: string, continuationChars: RegExp): boolean {
  for (const character of delta) {
    continuationChars.lastIndex = 0;
    if (continuationChars.test(character)) continue;
    return /\w/.test(character);
  }
  return false;
}

/**
 * Apply the existing per-delta tail cap to an already-safe append. The mutable
 * suffix begins at the first character whose whole-prefix redaction changed;
 * capping that suffix preserves cross-delta masking before discarding bytes.
 */
export function truncateStreamingDisplayAppend(
  previousText: string,
  appended: StreamingDisplayRedactionResult,
  maxDeltaChars: number,
  marker: string,
): StreamingDisplayRedactionResult {
  let mutableStart = 0;
  const commonLength = Math.min(previousText.length, appended.text.length);
  while (
    mutableStart < commonLength
    && previousText.charCodeAt(mutableStart) === appended.text.charCodeAt(mutableStart)
  ) {
    mutableStart += 1;
  }
  const keep = Math.max(0, maxDeltaChars - marker.length);
  const mutableText = appended.text.slice(mutableStart);
  const text = previousText.slice(0, mutableStart)
    + marker
    + mutableText.slice(Math.max(0, mutableText.length - keep));
  const appendedPrivateState = PRIVATE_STATE.get(appended.state);
  const stableSuffix = appendedPrivateState === undefined
    ? undefined
    : redactStableStreamingSuffix(appendedPrivateState.pendingRaw);
  return {
    text,
    redacted: appended.redacted,
    state: stateFor(
      text,
      '',
      appendedPrivateState?.continuationTerminator
        ?? stableSuffix?.terminator
        ?? (appendedPrivateState?.overflow === undefined ? undefined : /[^A-Za-z0-9_-]/),
      configFor(appendedPrivateState),
    ),
  };
}

/** Apply the established thinking tail cap without losing an active secret. */
export function truncateStreamingDisplayTail(
  appended: StreamingDisplayRedactionResult,
  maxTotalChars: number,
  marker: string,
): StreamingDisplayRedactionResult {
  const keep = Math.max(0, maxTotalChars - marker.length);
  const text = marker + appended.text.slice(Math.max(0, appended.text.length - keep));
  const appendedPrivateState = PRIVATE_STATE.get(appended.state);
  const stableSuffix = appendedPrivateState === undefined
    ? undefined
    : redactStableStreamingSuffix(appendedPrivateState.pendingRaw);
  return {
    text,
    redacted: appended.redacted,
    state: stateFor(
      text,
      '',
      appendedPrivateState?.continuationTerminator
        ?? stableSuffix?.terminator
        ?? (appendedPrivateState?.overflow === undefined ? undefined : /[^A-Za-z0-9_-]/),
      configFor(appendedPrivateState),
    ),
  };
}

function stateFor(
  settledText: string,
  pendingRaw: string,
  continuationTerminator?: RegExp,
  options: {
    readonly maxRecoveryChars: number;
    readonly recovery: 'head' | 'tail';
    readonly overflow?: ReversibleOverflow;
  } = {
    maxRecoveryChars: DEFAULT_MAX_RECOVERY_CHARS,
    recovery: 'head',
  },
): StreamingDisplayRedactionState {
  const state = Object.freeze({
    settledChars: settledText.length,
    pendingChars: pendingRaw.length
      + (options.overflow?.sourceHead.length ?? 0)
      + (options.overflow?.sourceTail.length ?? 0),
  });
  PRIVATE_STATE.set(state, {
    settledText,
    pendingRaw,
    maxRecoveryChars: options.maxRecoveryChars,
    recovery: options.recovery,
    ...(continuationTerminator === undefined ? {} : { continuationTerminator }),
    ...(options.overflow === undefined ? {} : { overflow: options.overflow }),
  });
  return state;
}

function configFor(
  state: PrivateStreamingDisplayRedactionState | undefined,
): { maxRecoveryChars: number; recovery: 'head' | 'tail' } {
  return {
    maxRecoveryChars: state?.maxRecoveryChars ?? DEFAULT_MAX_RECOVERY_CHARS,
    recovery: state?.recovery ?? 'head',
  };
}

function contextualTailStart(input: string, lastLineBreak: number): number | undefined {
  const authorization = /(^|[^A-Za-z0-9_])(authorization)\s*(?:(?:[:=])\s*([A-Za-z]*)(\s*))?$/i.exec(input);
  const apiKey = /(^|[\s"'<>(])((?:x-)?api[-_]?key)\s*(?:[:=]\s*)?$/i.exec(input);
  const authorizationScheme = authorization?.[3]?.toLowerCase() ?? '';
  const authorizationTrailingSpace = (authorization?.[4]?.length ?? 0) > 0;
  const authorizationPending = authorization !== null
    && ['bearer', 'basic', 'token'].some((scheme) => scheme.startsWith(authorizationScheme))
    && (!authorizationTrailingSpace
      || ['bearer', 'basic', 'token'].includes(authorizationScheme));
  const starts = [authorizationPending ? authorization : null, apiKey]
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match.index);

  if (lastLineBreak >= 0) {
    const completeContexts = [
      /\b(?:authorization)\s*[:=]\s*(?:bearer|basic|token)\s+[^\s"'<>]+/gi,
      /(^|[\s"'<>(])(?:x-)?api[-_]?key\s*[:=]\s*[^\s"'<>]+/gim,
    ];
    for (const pattern of completeContexts) {
      for (const match of input.matchAll(pattern)) {
        if (match.index < lastLineBreak && match.index + match[0].length > lastLineBreak) {
          starts.push(match.index);
        }
      }
    }
  }
  return starts.length === 0 ? undefined : Math.min(...starts);
}
