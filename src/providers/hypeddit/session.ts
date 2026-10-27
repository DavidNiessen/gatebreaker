import type { Gate, GateActionProgress, Resolution } from '../../domain/provider';

export interface HypedditNativeAuth {
  readonly id: string;
  readonly elementId: string;
  readonly window: Window;
  readonly callback: string;
  readonly started: number;
  callbackSeen?: boolean;
  checking?: boolean;
}
export interface HypedditState {
  readonly gate: string;
  readonly progress: Map<string, GateActionProgress>;
  readonly nativeAuth: Map<string, HypedditNativeAuth>;
  authRequired: boolean;
  listening?: boolean;
  acceptedEmail?: string;
  emailName?: string;
  ready?: { readonly at: number; readonly result: Resolution & { readonly ok: true } };
}
const documents = new WeakMap<Document, HypedditState>();
const gates = new WeakMap<Gate, Document>();
function field(document: Document, id: string): string {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)?.value.trim() ?? '';
}
export function hypedditState(document: Document): HypedditState {
  // Scope transient results to this exact document, gate and normal website session.
  const gate = JSON.stringify([
    field(document, 'current_download_file_listner'),
    field(document, 'fan_gate_id'),
    field(document, 'wrndk'),
    document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
  ]);
  let current = documents.get(document);
  if (!current || current.gate !== gate) {
    current = { gate, progress: new Map(), nativeAuth: new Map(), authRequired: false };
    documents.set(document, current);
  }
  return current;
}
export function bindHypedditSession(gate: Gate, document: Document): Gate {
  hypedditState(document);
  gates.set(gate, document);
  return gate;
}
export function hypedditGateState(gate: Gate): HypedditState | null {
  const document = gates.get(gate);
  return document ? hypedditState(document) : null;
}
/** Accepted values stay in memory, never in native inputs or website storage. */
export function hypedditEmail(document: Document): { email: string; name: string } | null {
  const current = hypedditState(document);
  return current.acceptedEmail
    ? { email: current.acceptedEmail, name: current.emailName ?? '' }
    : null;
}
export function hypedditReady(current: HypedditState): (Resolution & { readonly ok: true }) | null {
  return current.ready && Date.now() - current.ready.at <= 30000 ? current.ready.result : null;
}
