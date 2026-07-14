import { useCallback, useMemo, useReducer } from 'react';
import { replayEvents } from './replay.js';
const DEFAULT_MAX_EVENTS = 20000;
const reduceDevtools = (state, action) => {
    if (action.type === 'record') {
        const seq = (state.events.at(-1)?.seq ?? -1) + 1;
        const recorded = {
            seq,
            receivedAt: action.receivedAt,
            groupId: action.groupId,
            event: action.event,
        };
        const events = [...state.events, recorded];
        const overflow = events.length - action.maxEvents;
        if (overflow <= 0)
            return { ...state, events };
        return {
            events: events.slice(overflow),
            cursor: state.cursor === null ? null : Math.max(state.cursor - overflow, 0),
        };
    }
    if (action.type === 'set_cursor') {
        if (action.cursor === null || state.events.length === 0)
            return { ...state, cursor: null };
        return { ...state, cursor: Math.min(Math.max(action.cursor, 0), state.events.length - 1) };
    }
    return { events: [], cursor: null };
};
/** Records stream events and drives the time-travel cursor; returns null when disabled. */
export const useEventStreamDevtools = ({ enabled, replay, maxEvents = DEFAULT_MAX_EVENTS, }) => {
    const [state, dispatch] = useReducer((reduceDevtools), { events: [], cursor: null });
    const record = useCallback((groupId, event) => {
        dispatch({ type: 'record', groupId, event, receivedAt: Date.now(), maxEvents });
    }, [maxEvents]);
    const setCursor = useCallback((cursor) => dispatch({ type: 'set_cursor', cursor }), []);
    const clear = useCallback(() => dispatch({ type: 'clear' }), []);
    const replayed = useMemo(() => (state.cursor === null ? null : replayEvents(state.events, state.cursor, replay)), [state.events, state.cursor, replay]);
    return useMemo(() => {
        if (!enabled)
            return null;
        return { events: state.events, cursor: state.cursor, replayed, record, setCursor, clear };
    }, [enabled, state.events, state.cursor, replayed, record, setCursor, clear]);
};
