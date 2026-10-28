import type { GatePresentation } from '../../domain/provider';
import { isHypedditPage } from './urls';

export function hypedditPresentation(document: Document, url: URL): GatePresentation | null {
  if (!isHypedditPage(url)) return null;
  const control = document.querySelector('#downloadProcess, #gateDownloadButton');
  if (!control) return null;
  return {
    anchor: control.closest('.hype-download-gate-steps-wrapper, #myCarousel') ?? control,
  };
}
