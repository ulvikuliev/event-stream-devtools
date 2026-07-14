/**
 * State "as of the event under the cursor": folds all recorded events that share
 * the cursor event's groupId, from the start of the recording up to the cursor
 * inclusive — with the same reducer the live stream feeds through.
 */
export const replayEvents = (events, cursor, reducer) => {
    const target = events[Math.min(Math.max(cursor, 0), events.length - 1)];
    if (!target)
        return null;
    let state = reducer.initialState;
    for (const recorded of events) {
        if (recorded.seq > target.seq)
            break;
        if (recorded.groupId === target.groupId) {
            state = reducer.reduce(state, recorded.event);
        }
    }
    return { groupId: target.groupId, state };
};
