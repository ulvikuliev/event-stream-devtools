# @ulvikuliev/sse-websocket-time-travel

Time-travel devtools panel for event streams (SSE, WebSocket, anything push-based). Records incoming events and lets you scrub the application state to any recorded moment, replay the stream at its original speed, filter and inspect events, export the recording, drag/resize the panel or pop it out into a chromeless picture-in-picture window (Chrome 116+).

The library is state-agnostic: you provide a pure reducer that folds events into your state, and you decide how the replayed state substitutes the live one. Replay never mixes stream sessions — events are folded per `groupId` (a calculation id, run id, request id…).

## Usage

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

## Panel props

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

With focus inside the panel: `←`/`↑` step back, `→`/`↓` step forward. `▶` replays the recording from the cursor with original inter-event delays; any manual seek pauses the simulation.

## Build

```bash
npm install
npm run build   # tsc → dist/ + styles.css
```
