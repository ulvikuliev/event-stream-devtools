import { type ReactNode } from 'react';
import type { RecordedEvent } from './replay.js';
import type { EventStreamDevtoolsStore } from './use-event-stream-devtools.js';
export interface EventStreamDevtoolsPanelProps<TEvent, TState> {
    store: EventStreamDevtoolsStore<TEvent, TState>;
    /** Event type used for filter chips, colors and the list column. */
    getType: (event: TEvent) => string;
    title?: string;
    subtitle?: ReactNode;
    isConnected?: boolean;
    connectionError?: unknown;
    /** Id of the current live stream session, shown in the header. */
    liveGroupId?: string | null;
    /** One-line event summary for the list. */
    summarize?: (event: TEvent) => string;
    /** Extra labels for the detail block (e.g. the event id within the stream). */
    getEventMeta?: (recorded: RecordedEvent<TEvent>) => string[];
    /** Event type → CSS color for chips and the type column. */
    typeColors?: Record<string, string>;
    /** What the JSON detail pane shows; defaults to the whole event. */
    serializeDetail?: (event: TEvent) => unknown;
    exportFileName?: () => string;
    /** Extra root fields for the exported JSON. */
    exportMeta?: Record<string, unknown>;
    /** Prefix for the data-testid attributes of the panel controls. */
    dataTestId?: string;
}
export declare const EventStreamDevtoolsPanel: <TEvent, TState>({ store, getType, title, subtitle, isConnected, connectionError, liveGroupId, summarize, getEventMeta, typeColors, serializeDetail, exportFileName, exportMeta, dataTestId, }: EventStreamDevtoolsPanelProps<TEvent, TState>) => import("react").ReactPortal;
