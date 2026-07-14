import type { EventReducer, RecordedEvent, ReplayedState } from './replay.js';
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
export declare const useEventStreamDevtools: <TEvent, TState>({ enabled, replay, maxEvents, }: EventStreamDevtoolsOptions<TEvent, TState>) => EventStreamDevtoolsStore<TEvent, TState> | null;
