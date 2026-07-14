export interface RecordedEvent<TEvent> {
    seq: number;
    receivedAt: number;
    /** Logical stream session (a calculation id, run id, request id…); replay never mixes groups. */
    groupId: string | null;
    event: TEvent;
}

export interface EventReducer<TEvent, TState> {
    initialState: TState;
    /** Must be pure and must not mutate `state` or `initialState`. */
    reduce: (state: TState, event: TEvent) => TState;
}

export interface ReplayedState<TState> {
    groupId: string | null;
    state: TState;
}

/**
 * State "as of the event under the cursor": folds all recorded events that share
 * the cursor event's groupId, from the start of the recording up to the cursor
 * inclusive — with the same reducer the live stream feeds through.
 */
export const replayEvents = <TEvent, TState>(
    events: RecordedEvent<TEvent>[],
    cursor: number,
    reducer: EventReducer<TEvent, TState>,
): ReplayedState<TState> | null => {
    const target = events[Math.min(Math.max(cursor, 0), events.length - 1)];
    if (!target) return null;
    let state = reducer.initialState;
    for (const recorded of events) {
        if (recorded.seq > target.seq) break;
        if (recorded.groupId === target.groupId) {
            state = reducer.reduce(state, recorded.event);
        }
    }
    return { groupId: target.groupId, state };
};
