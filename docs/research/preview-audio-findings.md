# Sylver preview audio: static contract — 2026-10-26

Question: does the signed `_preview` object contain the full 294-second audio
with a client-only 90-second playback window, or a separately cut excerpt?

## Conclusion

The shipped player **expects a separately cut preview excerpt**. Audio time
zero is explicitly mapped to the excerpt's position inside a full-track
waveform. No timer imposing a 90-second playback limit was found in the three
selected scripts. Native audio end-of-file is used for completion.

This establishes the client's intended contract, not the actual bytes of a
particular S3 object. Only media metadata/range evidence can establish whether
the current `_preview` object conforms to that contract. No audio body was
requested or downloaded in this subtask.

## Observations

The retained target HTML references exactly these scripts at lines 2095–2097:

- `https://hypeddit.com/js/gate-wave.js?v=160.0.10`
- `https://hypeddit.com/js/peakcontrol.js?v=160.0.10`
- `https://hypeddit.com/js/soundplayeraudiotag.js?v=160.0.10`

The retained HTML's nonsecret numeric metadata at lines 687–690 yields:

| Field             | Samples / rate      | Seconds    |
| ----------------- | ------------------- | ---------- |
| Preview offset    | 7,675,904 / 44,100  | 174.056780 |
| Preview length    | 3,969,000 / 44,100  | 90         |
| Full frame length | 12,965,400 / 44,100 | 294        |

In `gate-wave.js`:

- Lines 24–36 construct independent clip and full ranges. The audio source is
  the page's `preview_url`, while peak/waveform data uses `wave_file`.
- Lines 45–46 set the waveform's full and active ranges separately.
- Lines 59–61 map an audio playhead to the full waveform by adding the clip
  offset. For this sample, audio time 0 maps to approximately original time
  174.057 seconds.
- Lines 66–77 reverse that mapping for seeks by subtracting the clip offset
  before assigning the preview's time. Clicking beyond the clip's end resets
  playback; this is seek handling, not a playback-duration timer.
- Lines 92–98 reset the player on completion. Lines 197 and 214 register the
  completion callback.

In `peakcontrol.js`:

- Lines 46–52 store `audioFileURL`, `playableRange`, and `totalRange` separately.
- Lines 81–88 set the HTML audio element's `src` directly to `audioFileURL`.
- Lines 382–391 and 454–492 use the full and active ranges for waveform
  presentation. The full waveform's duration therefore does not establish the
  duration of the separate preview media.

In `soundplayeraudiotag.js`:

- Lines 18–20 attach completion handling to the native audio `onended` event.
- Line 36 assigns `currentTime` to the preview playhead directly.
- Lines 75–90 implement seeks without adding an original-track offset.
- Lines 121–127 use an interval only to report the current playhead. No
  90-second cutoff is implemented there.
- Lines 135–139 reassign native completion handling.

## REA evidence

Parent: `ev_f0da91b5a04cd461d5d70c0849e6c799aef87d933f1efa15740008f64ede88ff`.
Summary: `ev_670f27fbe515737aa6c877adc2fb0f6e3afbf18c9f7552f3bb3d3330e232d712`.

Three referenced JavaScript files, 26,861 bytes, three parses, zero parse
failures. Static application inventory is complete for this selected directory;
semantic coverage remains partial/unknown because dynamic JavaScript calls are
not proven. REA parsed inert code and did not execute it or request audio.

| Script                 | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| gate-wave.js           | `64f81b8dae93d80ce809d03135af9598b1017ccf2558d91f06f06117ca8c1635` |
| peakcontrol.js         | `ad1b77f8b7d73aeab4dcf9564fe687852d5fbb239a426a0d99211987960ee908` |
| soundplayeraudiotag.js | `0565ffe1563bb600d00a6017ccee5b0fb24581a9a1c2ecbb8f6f436f70c2fe58` |

## Product implication

Do not offer this preview as a full original file based on `file_frame_length`
or waveform size. A separately labelled full-preview fallback would require
independent evidence that the actual media duration equals the full track,
and must preserve any quality/format distinction from the protected main file.
The static evidence alone does not justify such a fallback for Sylver.
