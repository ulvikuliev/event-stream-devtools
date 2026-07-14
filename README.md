# sse-websocket-time-travel

Time-travel debugger for SSE and WebSocket streams. Records every incoming event and lets you rewind your application state to any recorded moment, step through events one by one, or replay the whole stream at its original pace.

Browser devtools already show you raw frames. What they don't show is what those frames *did* to your app. This panel closes that gap: you plug in a pure reducer that folds events into state, and the panel drives a cursor through the recording — your UI re-renders exactly as it looked after event #N.

Built for debugging a production SSE pipeline (progressive risk-score graphs in an AML platform), then extracted because nothing about it was domain-specific.

## Features

- **Recording** — every event is captured with a timestamp and a session id (`groupId`); replay never mixes sessions. Ring buffer, 20k events by default.
- **Time travel** — pause, scrub with a slider, click any row, step with `←`/`→`. The store hands you the folded state at the cursor; how to substitute it for your live state is up to you (usually a couple of lines).
- **Original-speed replay** — `▶` re-plays the recording from the cursor keeping the real inter-event delays, so races, pacing and animations reproduce as they happened. Any manual seek pauses the simulation.
- **Inspection** — virtualized event list, per-type filter chips with counts, JSON detail pane, copy, export of the whole recording to JSON.
- **Panel UX** — drag by the header, resize by the corner grip, collapse to a pill, or pop the panel out into a real chromeless always-on-top window (Document Picture-in-Picture, Chrome 116+).
- **No runtime dependencies** — `react` / `react-dom` peers only. Styling is a single CSS file on `--esd-*` custom properties.

## Install

Not on npm yet — install straight from GitHub (a built `dist/` is committed):

```bash
yarn add github:ulvikuliev/sse-websocket-time-travel#v0.1.0
# or
npm i github:ulvikuliev/sse-websocket-time-travel#v0.1.0
```

## Quick start

```tsx
import {
    EventStreamDevtoolsPanel,
    useEventStreamDevtools,
    type EventReducer,
} from '@ulvikuliev/sse-websocket-time-travel';
import '@ulvikuliev/sse-websocket-time-travel/styles.css';

interface MyState { items: string[] }

// Module-level constant: must be a stable reference and a pure reducer.
const reducer: EventReducer<MyEvent, MyState> = {
    initialState: { items: [] },
    reduce: (state, event) =>
        event.type === 'item_added' ? { ...state, items: [...state.items, event.payload.id] } : state,
};

const MyStreamProvider = () => {
    const devtools = useEventStreamDevtools<MyEvent, MyState>({ enabled: isDebugEnabled, replay: reducer });

    useMyStream({
        onEvent: event => {
            devtools?.record(currentSessionId, event);
            applyToLiveState(event);
        },
    });

    // Time travel: when the cursor is set, render the replayed state instead of the live one.
    const state = devtools?.replayed ? devtools.replayed.state : liveState;

    return (
        <>
            <App state={state} />
            {devtools && (
                <EventStreamDevtoolsPanel
                    store={devtools}
                    getType={event => event.type}
                    title="My stream"
                    summarize={event => event.payload.id}
                />
            )}
        </>
    );
};
```

The hook returns `null` when `enabled` is false, so gating it behind a feature flag costs nothing in production.

## API

### `useEventStreamDevtools({ enabled, replay, maxEvents? })`

Returns the store (or `null` when disabled):

| Field | Purpose |
| --- | --- |
| `events` | The recording: `{ seq, receivedAt, groupId, event }[]` |
| `cursor` | Index the consumer is rewound to; `null` means live |
| `replayed` | `{ groupId, state }` folded up to the cursor, `null` when live |
| `record(groupId, event)` | Call from your stream's `onmessage` |
| `setCursor(index \| null)` | Programmatic seek / back to live |
| `clear()` | Drop the recording |

`replayEvents(events, cursor, reducer)` is exported separately if you want the fold without React.

### `<EventStreamDevtoolsPanel />`

| Prop | Purpose |
| --- | --- |
| `store` | Result of `useEventStreamDevtools` |
| `getType(event)` | Event type for filter chips, colors and the list column |
| `title`, `subtitle` | Header labels |
| `isConnected`, `connectionError` | Connection dot state |
| `liveGroupId` | Current stream session id shown in the header |
| `summarize(event)` | One-line summary for the list |
| `getEventMeta(recorded)` | Extra labels in the detail block |
| `typeColors` | Event type → CSS color |
| `serializeDetail(event)` | What the JSON detail pane shows (default: whole event) |
| `exportFileName()`, `exportMeta` | Export JSON naming and extra root fields |
| `dataTestId` | Prefix for all `data-testid` attributes |

## Theming

All colors and fonts are CSS custom properties (`--esd-*`) declared on `.esd-panel` / `.esd-launcher` — override them in your own stylesheet.

## Keyboard

With focus inside the panel: `←`/`↑` step back, `→`/`↓` step forward. Steps walk the filtered list, and any manual seek pauses a running replay.

## Development

```bash
npm install
npm run build   # tsc → dist/ + styles.css
```

## License

MIT
