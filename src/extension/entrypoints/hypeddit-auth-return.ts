import { extension } from '../platform/browser';
import { messages } from '../platform/messages';
// Runs only on a response document. Never read OAuth query values or credentials.
if (
  window.top === window &&
  location.origin === 'https://hypeddit.com' &&
  location.pathname === '/spotify_callback'
)
  void extension.runtime.sendMessage({ type: messages.spotifyReturned }).catch(() => {});
