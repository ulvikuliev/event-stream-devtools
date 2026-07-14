import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { RecordedEvent } from './replay.js';
import type { EventStreamDevtoolsStore } from './use-event-stream-devtools.js';

// Must match the .esd-row block-size in styles.css — list virtualization relies on it.
const ROW_HEIGHT = 22;
const WINDOW_ROWS = 32;
const OVERSCAN_ROWS = 6;

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

interface DocumentPictureInPictureApi {
    requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

const getPictureInPictureApi = (): DocumentPictureInPictureApi | undefined =>
    (window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi }).documentPictureInPicture;

const copyStylesTo = (target: Document) => {
    [...document.styleSheets].forEach(sheet => {
        try {
            const style = target.createElement('style');
            style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
            target.head.appendChild(style);
        } catch {
            if (sheet.href) {
                const link = target.createElement('link');
                link.rel = 'stylesheet';
                link.href = sheet.href;
                target.head.appendChild(link);
            }
        }
    });
};

const formatEventTime = (timestampMs: number) => {
    const date = new Date(timestampMs);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

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

export const EventStreamDevtoolsPanel = <TEvent, TState>({
    store,
    getType,
    title = 'Event stream devtools',
    subtitle,
    isConnected,
    connectionError,
    liveGroupId,
    summarize,
    getEventMeta,
    typeColors,
    serializeDetail,
    exportFileName,
    exportMeta,
    dataTestId = 'event-stream-devtools',
}: EventStreamDevtoolsPanelProps<TEvent, TState>) => {
    const { events, cursor, setCursor, clear } = store;
    const [isOpen, setIsOpen] = useState(true);
    const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<string>>(() => new Set());
    const [scrollTop, setScrollTop] = useState(0);
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [pipWindow, setPipWindow] = useState<Window | null>(null);
    const [pipHeight, setPipHeight] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
    const resizeRef = useRef<{
        pointerId: number;
        startWidth: number;
        startHeight: number;
        startX: number;
        startY: number;
    } | null>(null);

    const lastIndex = events.length - 1;
    const isLive = cursor === null;
    const selectedIndex = isLive ? lastIndex : cursor;
    const selected = selectedIndex >= 0 ? events[selectedIndex] : undefined;
    const behind = isLive || selectedIndex < 0 ? 0 : lastIndex - selectedIndex;

    const typeCounts = useMemo(() => {
        const counts = new Map<string, number>();
        events.forEach(({ event }) => {
            const type = getType(event);
            counts.set(type, (counts.get(type) ?? 0) + 1);
        });
        return counts;
    }, [events, getType]);

    const visibleRows = useMemo(
        () =>
            events
                .map((recorded, index) => ({ recorded, index }))
                .filter(row => !hiddenTypes.has(getType(row.recorded.event))),
        [events, hiddenTypes, getType],
    );

    // Delay before the next event is the real recorded interval. The value is stable
    // for a given cursor, so live appends don't restart the pending timer.
    const playbackDelay = useMemo(() => {
        if (cursor === null) return null;
        const next = events[cursor + 1];
        if (!next) return null;
        return Math.max(next.receivedAt - (events[cursor]?.receivedAt ?? next.receivedAt), 0);
    }, [events, cursor]);

    useEffect(() => {
        if (!isPlaying) return undefined;
        if (cursor === null || playbackDelay === null) {
            setIsPlaying(false);
            return undefined;
        }
        const timer = setTimeout(() => setCursor(cursor + 1), playbackDelay);
        return () => clearTimeout(timer);
    }, [isPlaying, playbackDelay, cursor, setCursor]);

    useEffect(() => {
        if (!pipWindow) return undefined;
        const handlePageHide = () => setPipWindow(null);
        const handleResize = () => setPipHeight(pipWindow.innerHeight);
        setPipHeight(pipWindow.innerHeight);
        pipWindow.addEventListener('pagehide', handlePageHide);
        pipWindow.addEventListener('resize', handleResize);
        return () => {
            pipWindow.removeEventListener('pagehide', handlePageHide);
            pipWindow.removeEventListener('resize', handleResize);
            pipWindow.close();
        };
    }, [pipWindow]);

    useEffect(() => {
        const list = listRef.current;
        if (!isLive || !list) return;
        list.scrollTop = list.scrollHeight;
    }, [isLive, visibleRows.length]);

    useEffect(() => {
        const list = listRef.current;
        if (isLive || !list) return;
        const rowPosition = visibleRows.findIndex(row => row.index === selectedIndex);
        if (rowPosition < 0) return;
        const rowTop = rowPosition * ROW_HEIGHT;
        if (rowTop < list.scrollTop) {
            list.scrollTop = rowTop;
        } else if (rowTop + ROW_HEIGHT > list.scrollTop + list.clientHeight) {
            list.scrollTop = rowTop - list.clientHeight + ROW_HEIGHT;
        }
    }, [selectedIndex, isLive, visibleRows]);

    let connectionModifier = 'esd-dot-idle';
    if (isConnected) {
        connectionModifier = 'esd-dot-connected';
    } else if (connectionError) {
        connectionModifier = 'esd-dot-error';
    }

    let badgeModifier = 'esd-badge-paused';
    let badgeText = 'paused';
    if (isLive) {
        badgeModifier = 'esd-badge-live';
        badgeText = 'live';
    } else if (isPlaying) {
        badgeModifier = 'esd-badge-playing';
        badgeText = 'playing';
    }

    if (!isOpen) {
        return createPortal(
            <button
                type="button"
                className="esd-launcher"
                data-testid={`${dataTestId}-launcher`}
                onClick={() => setIsOpen(true)}
            >
                <span className={cx('esd-dot', connectionModifier)} />
                {title} {events.length}
            </button>,
            document.body,
        );
    }

    const toggleType = (type: string) => {
        setHiddenTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) {
                next.delete(type);
            } else {
                next.add(type);
            }
            return next;
        });
    };

    const seekTo = (index: number | null) => {
        setIsPlaying(false);
        setCursor(index);
    };
    const togglePlayback = () => setIsPlaying(prev => !prev);

    const stepBack = () => {
        let target: number | undefined;
        for (const row of visibleRows) {
            if (row.index >= selectedIndex) break;
            target = row.index;
        }
        if (target !== undefined) seekTo(target);
    };
    const stepForward = () => {
        const next = visibleRows.find(row => row.index > selectedIndex);
        if (next) seekTo(next.index);
    };
    const jumpToFirst = () => {
        const first = visibleRows[0];
        if (first) seekTo(first.index);
    };
    const jumpToLast = () => {
        const last = visibleRows.at(-1);
        if (last) seekTo(last.index);
    };

    const startDrag = (e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        if (e.target instanceof Element && e.target.closest('button')) return;
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) return;
        dragRef.current = { pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const panelWidth = panelRef.current?.getBoundingClientRect().width ?? 480;
        setPosition({
            x: Math.min(Math.max(e.clientX - drag.offsetX, 60 - panelWidth), window.innerWidth - 60),
            y: Math.min(Math.max(e.clientY - drag.offsetY, 0), window.innerHeight - 40),
        });
    };
    const endDrag = (e: PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
    };

    const startResize = (e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) return;
        if (!position) setPosition({ x: rect.left, y: rect.top });
        resizeRef.current = {
            pointerId: e.pointerId,
            startWidth: rect.width,
            startHeight: rect.height,
            startX: e.clientX,
            startY: e.clientY,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const moveResize = (e: PointerEvent<HTMLDivElement>) => {
        const resize = resizeRef.current;
        if (!resize || resize.pointerId !== e.pointerId) return;
        const panelLeft = panelRef.current?.getBoundingClientRect().left ?? 0;
        const panelTop = panelRef.current?.getBoundingClientRect().top ?? 0;
        const maxWidth = Math.max(360, window.innerWidth - panelLeft - 8);
        const maxHeight = Math.max(280, window.innerHeight - panelTop - 8);
        setSize({
            width: Math.min(Math.max(resize.startWidth + e.clientX - resize.startX, 360), maxWidth),
            height: Math.min(Math.max(resize.startHeight + e.clientY - resize.startY, 280), maxHeight),
        });
    };
    const endResize = (e: PointerEvent<HTMLDivElement>) => {
        if (resizeRef.current?.pointerId === e.pointerId) resizeRef.current = null;
    };

    const handlePanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            panelRef.current?.focus();
            stepBack();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            panelRef.current?.focus();
            stepForward();
        }
    };

    const panelDocument = () => panelRef.current?.ownerDocument ?? document;

    const openAsWindow = async () => {
        const pipApi = getPictureInPictureApi();
        if (!pipApi || pipWindow) return;
        const rect = panelRef.current?.getBoundingClientRect();
        const pip = await pipApi.requestWindow({
            width: Math.round(rect?.width ?? 480),
            height: Math.round(Math.max(rect?.height ?? 0, 560)),
        });
        copyStylesTo(pip.document);
        pip.document.body.style.margin = '0';
        setPipWindow(pip);
    };

    const copyJson = (text: string) => {
        const doc = panelDocument();
        const area = doc.createElement('textarea');
        area.value = text;
        doc.body.appendChild(area);
        area.select();
        doc.execCommand('copy');
        area.remove();
    };

    const exportEvents = () => {
        const contents = JSON.stringify({ ...exportMeta, exportedAt: new Date().toISOString(), events }, null, 2);
        const blob = new Blob([contents], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = panelDocument().createElement('a');
        link.href = url;
        link.download = exportFileName?.() ?? `event-stream_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const isWindowed = Boolean(pipWindow);
    const viewportHeight = isWindowed ? pipHeight : (size?.height ?? 0);
    const windowRows = Math.max(WINDOW_ROWS, Math.ceil(viewportHeight / ROW_HEIGHT));
    const firstRendered = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
    const lastRendered = Math.min(visibleRows.length, firstRendered + windowRows + OVERSCAN_ROWS * 2);

    return createPortal(
        <div
            ref={panelRef}
            role="dialog"
            aria-label={title}
            tabIndex={-1}
            className={cx('esd-panel', isWindowed && 'esd-panel-windowed')}
            style={
                !isWindowed && (position || size)
                    ? {
                          ...(position && {
                              insetBlockStart: position.y,
                              insetInlineStart: position.x,
                              insetBlockEnd: 'auto',
                              insetInlineEnd: 'auto',
                          }),
                          ...(size && {
                              inlineSize: size.width,
                              blockSize: size.height,
                              maxBlockSize: 'none',
                          }),
                      }
                    : undefined
            }
            data-testid={dataTestId}
            onKeyDown={handlePanelKeyDown}
        >
            <div
                className={cx('esd-header', isWindowed && 'esd-header-windowed')}
                onPointerDown={isWindowed ? undefined : startDrag}
                onPointerMove={isWindowed ? undefined : moveDrag}
                onPointerUp={isWindowed ? undefined : endDrag}
                onPointerCancel={isWindowed ? undefined : endDrag}
            >
                <span className={cx('esd-dot', connectionModifier)} />
                <span className="esd-header-title">{title}</span>
                {subtitle && <span className="esd-header-target">{subtitle}</span>}
                {liveGroupId && <span className="esd-header-target">group {liveGroupId.slice(0, 8)}</span>}
                <span className={cx('esd-badge', badgeModifier)}>{badgeText}</span>
                {!isWindowed && Boolean(getPictureInPictureApi()) && (
                    <button
                        type="button"
                        className="esd-control-button"
                        title="Open as window"
                        data-testid={`${dataTestId}-open-window`}
                        onClick={openAsWindow}
                    >
                        ⧉
                    </button>
                )}
                {isWindowed ? (
                    <button
                        type="button"
                        className="esd-control-button"
                        title="Return to page"
                        data-testid={`${dataTestId}-return`}
                        onClick={() => pipWindow?.close()}
                    >
                        ⇲
                    </button>
                ) : (
                    <button
                        type="button"
                        className="esd-control-button"
                        data-testid={`${dataTestId}-collapse`}
                        onClick={() => setIsOpen(false)}
                    >
                        —
                    </button>
                )}
            </div>

            <div className="esd-controls">
                <button
                    type="button"
                    className="esd-control-button"
                    title="First event"
                    onClick={jumpToFirst}
                    disabled={visibleRows.length === 0}
                >
                    ⏮
                </button>
                <button
                    type="button"
                    className="esd-control-button"
                    title="Step back (←)"
                    onClick={stepBack}
                    disabled={visibleRows.length === 0}
                >
                    ◁
                </button>
                <button
                    type="button"
                    className="esd-control-button"
                    title={isPlaying ? 'Pause simulation' : 'Replay stream from this event (original timing)'}
                    data-testid={`${dataTestId}-play`}
                    onClick={togglePlayback}
                    disabled={!isPlaying && (isLive || selectedIndex >= lastIndex)}
                >
                    {isPlaying ? '⏸' : '▶'}
                </button>
                <button
                    type="button"
                    className="esd-control-button"
                    title="Step forward (→)"
                    onClick={stepForward}
                    disabled={visibleRows.length === 0}
                >
                    ▷
                </button>
                <button
                    type="button"
                    className="esd-control-button"
                    title="Last event"
                    onClick={jumpToLast}
                    disabled={visibleRows.length === 0}
                >
                    ⏭
                </button>
                {isLive ? (
                    <button
                        type="button"
                        className="esd-control-button"
                        onClick={() => seekTo(lastIndex)}
                        disabled={events.length === 0}
                    >
                        Pause
                    </button>
                ) : (
                    <button type="button" className="esd-control-button" onClick={() => seekTo(null)}>
                        Live
                    </button>
                )}
                <span className="esd-position">
                    {events.length ? `#${selectedIndex + 1} / ${events.length}` : 'no events'}
                </span>
                {behind > 0 && <span className="esd-behind">+{behind} new</span>}
            </div>

            <div className="esd-slider-row">
                <input
                    type="range"
                    className="esd-slider"
                    min={0}
                    max={Math.max(lastIndex, 0)}
                    value={Math.max(selectedIndex, 0)}
                    disabled={events.length === 0}
                    onChange={e => seekTo(Number(e.target.value))}
                />
            </div>

            <div className="esd-chips">
                {[...typeCounts.entries()].map(([type, count]) => (
                    <button
                        key={type}
                        type="button"
                        className={cx('esd-chip', hiddenTypes.has(type) && 'esd-chip-off')}
                        style={{ color: typeColors?.[type] }}
                        onClick={() => toggleType(type)}
                    >
                        {type} {count}
                    </button>
                ))}
            </div>

            <div
                ref={listRef}
                className="esd-list"
                data-testid={`${dataTestId}-list`}
                onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
            >
                {visibleRows.length === 0 && <div className="esd-empty">No events yet</div>}
                <div className="esd-list-inner" style={{ blockSize: visibleRows.length * ROW_HEIGHT }}>
                    {visibleRows.slice(firstRendered, lastRendered).map((row, offset) => {
                        const type = getType(row.recorded.event);
                        return (
                            <button
                                key={row.recorded.seq}
                                type="button"
                                className={cx(
                                    'esd-row',
                                    row.index === selectedIndex && 'esd-row-selected',
                                    row.index > selectedIndex && 'esd-row-future',
                                )}
                                style={{ insetBlockStart: (firstRendered + offset) * ROW_HEIGHT }}
                                onClick={() => seekTo(row.index)}
                            >
                                <span className="esd-row-seq">{row.recorded.seq}</span>
                                <span className="esd-row-time">{formatEventTime(row.recorded.receivedAt)}</span>
                                <span className="esd-row-type" style={{ color: typeColors?.[type] }}>
                                    {type}
                                </span>
                                <span className="esd-row-summary">{summarize?.(row.recorded.event) ?? ''}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {selected && (
                <div className="esd-detail">
                    <div className="esd-detail-meta">
                        {(getEventMeta?.(selected) ?? []).map(meta => (
                            <span key={meta}>{meta}</span>
                        ))}
                        <span>group {selected.groupId ? selected.groupId.slice(0, 8) : '—'}</span>
                        <span>received {formatEventTime(selected.receivedAt)}</span>
                        <button
                            type="button"
                            className="esd-control-button"
                            onClick={() => copyJson(JSON.stringify(selected.event, null, 2))}
                        >
                            Copy
                        </button>
                    </div>
                    <pre className="esd-payload">
                        {JSON.stringify(serializeDetail ? serializeDetail(selected.event) : selected.event, null, 2)}
                    </pre>
                </div>
            )}

            <div className="esd-footer">
                <button type="button" className="esd-control-button" onClick={exportEvents} disabled={events.length === 0}>
                    Export JSON
                </button>
                <button type="button" className="esd-control-button" onClick={clear} disabled={events.length === 0}>
                    Clear
                </button>
                <span className="esd-footer-hint">{events.length} events</span>
            </div>
            {!isWindowed && (
                <div
                    className="esd-resize-grip"
                    data-testid={`${dataTestId}-resize`}
                    onPointerDown={startResize}
                    onPointerMove={moveResize}
                    onPointerUp={endResize}
                    onPointerCancel={endResize}
                />
            )}
        </div>,
        pipWindow ? pipWindow.document.body : document.body,
    );
};
