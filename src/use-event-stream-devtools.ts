import { useCallback, useMemo, useReducer } from 'react';

import { replayEvents } from './replay.js';

import type { EventReducer, RecordedEvent, ReplayedState } from './replay.js';

const DEFAULT_MAX_EVENTS = 20000;

interface DevtoolsState<TEvent> {
    events: RecordedEvent<TEvent>[];
    /** Index of the event the consumer is rewound to; null means live mode. */
    cursor: number | null;
}

type DevtoolsAction<TEvent> =
    | { type: 'record'; groupId: string | null; event: TEvent; receivedAt: number; maxEvents: number }
    | { type: 'set_cursor'; cursor: number | null }
    | { type: 'clear' };

const reduceDevtools = <TEvent>(
    state: DevtoolsState<TEvent>,
    action: DevtoolsAction<TEvent>,
): DevtoolsState<TEvent> => {
    if (action.type === 'record') {
        const seq = (state.events.at(-1)?.seq ?? -1) + 1;
        const recorded: RecordedEvent<TEvent> = {
            seq,
            receivedAt: action.receivedAt,
            groupId: action.groupId,
            event: action.event,
        };
        const events = [...state.events, recorded];
        const overflow = events.length - action.maxEvents;
        if (overflow <= 0) return { ...state, events };
        return {
            events: events.slice(overflow),
            cursor: state.cursor === null ? null : Math.max(state.cursor - overflow, 0),
        };
    }
    if (action.type === 'set_cursor') {
        if (action.cursor === null || state.events.length === 0) return { ...state, cursor: null };
        return { ...state, cursor: Math.min(Math.max(action.cursor, 0), state.events.length - 1) };
    }
    return { events: [], cursor: null };
};

export interface EventStreamDevtoolsOptions<TEvent, TState> {
    enabled: boolean;
    /** Pass a stable reference (module-level constant) — it participates in memo deps. */
    replay: EventReducer<TEvent, TState>;
    maxEvents?: number;
}

export interface EventStreamDevtoolsStore<TEvent, TState> {
    events: RecordedEvent<TEvent>[];
    cursor: number | null;
    /** State at the cursor; null in live mode (the consumer keeps rendering its live state). */
    replayed: ReplayedState<TState> | null;
    record: (groupId: string | null, event: TEvent) => void;
    setCursor: (cursor: number | null) => void;
    clear: () => void;
}

/** Records stream events and drives the time-travel cursor; returns null when disabled. */
export const useEventStreamDevtools = <TEvent, TState>({
    enabled,
    replay,
    maxEvents = DEFAULT_MAX_EVENTS,
}: EventStreamDevtoolsOptions<TEvent, TState>): EventStreamDevtoolsStore<TEvent, TState> | null => {
    const [state, dispatch] = useReducer(reduceDevtools<TEvent>, { events: [], cursor: null });

    const record = useCallback(
        (groupId: string | null, event: TEvent) => {
            dispatch({ type: 'record', groupId, event, receivedAt: Date.now(), maxEvents });
        },
        [maxEvents],
    );
    const setCursor = useCallback((cursor: number | null) => dispatch({ type: 'set_cursor', cursor }), []);
    const clear = useCallback(() => dispatch({ type: 'clear' }), []);

    const replayed = useMemo(
        () => (state.cursor === null ? null : replayEvents(state.events, state.cursor, replay)),
        [state.events, state.cursor, replay],
    );

    return useMemo(() => {
        if (!enabled) return null;
        return { events: state.events, cursor: state.cursor, replayed, record, setCursor, clear };
    }, [enabled, state.events, state.cursor, replayed, record, setCursor, clear]);
};
