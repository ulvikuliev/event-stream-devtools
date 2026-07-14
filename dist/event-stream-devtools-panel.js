import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
// Must match the .esd-row block-size in styles.css — list virtualization relies on it.
const ROW_HEIGHT = 22;
const WINDOW_ROWS = 32;
const OVERSCAN_ROWS = 6;
const cx = (...parts) => parts.filter(Boolean).join(' ');
const getPictureInPictureApi = () => window.documentPictureInPicture;
const copyStylesTo = (target) => {
    [...document.styleSheets].forEach(sheet => {
        try {
            const style = target.createElement('style');
            style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
            target.head.appendChild(style);
        }
        catch {
            if (sheet.href) {
                const link = target.createElement('link');
                link.rel = 'stylesheet';
                link.href = sheet.href;
                target.head.appendChild(link);
            }
        }
    });
};
const formatEventTime = (timestampMs) => {
    const date = new Date(timestampMs);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};
export const EventStreamDevtoolsPanel = ({ store, getType, title = 'Event stream devtools', subtitle, isConnected, connectionError, liveGroupId, summarize, getEventMeta, typeColors, serializeDetail, exportFileName, exportMeta, dataTestId = 'event-stream-devtools', }) => {
    const { events, cursor, setCursor, clear } = store;
    const [isOpen, setIsOpen] = useState(true);
    const [hiddenTypes, setHiddenTypes] = useState(() => new Set());
    const [scrollTop, setScrollTop] = useState(0);
    const [position, setPosition] = useState(null);
    const [size, setSize] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [pipWindow, setPipWindow] = useState(null);
    const [pipHeight, setPipHeight] = useState(0);
    const listRef = useRef(null);
    const panelRef = useRef(null);
    const dragRef = useRef(null);
    const resizeRef = useRef(null);
    const lastIndex = events.length - 1;
    const isLive = cursor === null;
    const selectedIndex = isLive ? lastIndex : cursor;
    const selected = selectedIndex >= 0 ? events[selectedIndex] : undefined;
    const behind = isLive || selectedIndex < 0 ? 0 : lastIndex - selectedIndex;
    const typeCounts = useMemo(() => {
        const counts = new Map();
        events.forEach(({ event }) => {
            const type = getType(event);
            counts.set(type, (counts.get(type) ?? 0) + 1);
        });
        return counts;
    }, [events, getType]);
    const visibleRows = useMemo(() => events
        .map((recorded, index) => ({ recorded, index }))
        .filter(row => !hiddenTypes.has(getType(row.recorded.event))), [events, hiddenTypes, getType]);
    // Delay before the next event is the real recorded interval. The value is stable
    // for a given cursor, so live appends don't restart the pending timer.
    const playbackDelay = useMemo(() => {
        if (cursor === null)
            return null;
        const next = events[cursor + 1];
        if (!next)
            return null;
        return Math.max(next.receivedAt - (events[cursor]?.receivedAt ?? next.receivedAt), 0);
    }, [events, cursor]);
    useEffect(() => {
        if (!isPlaying)
            return undefined;
        if (cursor === null || playbackDelay === null) {
            setIsPlaying(false);
            return undefined;
        }
        const timer = setTimeout(() => setCursor(cursor + 1), playbackDelay);
        return () => clearTimeout(timer);
    }, [isPlaying, playbackDelay, cursor, setCursor]);
    useEffect(() => {
        if (!pipWindow)
            return undefined;
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
        if (!isLive || !list)
            return;
        list.scrollTop = list.scrollHeight;
    }, [isLive, visibleRows.length]);
    useEffect(() => {
        const list = listRef.current;
        if (isLive || !list)
            return;
        const rowPosition = visibleRows.findIndex(row => row.index === selectedIndex);
        if (rowPosition < 0)
            return;
        const rowTop = rowPosition * ROW_HEIGHT;
        if (rowTop < list.scrollTop) {
            list.scrollTop = rowTop;
        }
        else if (rowTop + ROW_HEIGHT > list.scrollTop + list.clientHeight) {
            list.scrollTop = rowTop - list.clientHeight + ROW_HEIGHT;
        }
    }, [selectedIndex, isLive, visibleRows]);
    let connectionModifier = 'esd-dot-idle';
    if (isConnected) {
        connectionModifier = 'esd-dot-connected';
    }
    else if (connectionError) {
        connectionModifier = 'esd-dot-error';
    }
    let badgeModifier = 'esd-badge-paused';
    let badgeText = 'paused';
    if (isLive) {
        badgeModifier = 'esd-badge-live';
        badgeText = 'live';
    }
    else if (isPlaying) {
        badgeModifier = 'esd-badge-playing';
        badgeText = 'playing';
    }
    if (!isOpen) {
        return createPortal(_jsxs("button", { type: "button", className: "esd-launcher", "data-testid": `${dataTestId}-launcher`, onClick: () => setIsOpen(true), children: [_jsx("span", { className: cx('esd-dot', connectionModifier) }), title, " ", events.length] }), document.body);
    }
    const toggleType = (type) => {
        setHiddenTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) {
                next.delete(type);
            }
            else {
                next.add(type);
            }
            return next;
        });
    };
    const seekTo = (index) => {
        setIsPlaying(false);
        setCursor(index);
    };
    const togglePlayback = () => setIsPlaying(prev => !prev);
    const stepBack = () => {
        let target;
        for (const row of visibleRows) {
            if (row.index >= selectedIndex)
                break;
            target = row.index;
        }
        if (target !== undefined)
            seekTo(target);
    };
    const stepForward = () => {
        const next = visibleRows.find(row => row.index > selectedIndex);
        if (next)
            seekTo(next.index);
    };
    const jumpToFirst = () => {
        const first = visibleRows[0];
        if (first)
            seekTo(first.index);
    };
    const jumpToLast = () => {
        const last = visibleRows.at(-1);
        if (last)
            seekTo(last.index);
    };
    const startDrag = (e) => {
        if (e.button !== 0)
            return;
        if (e.target instanceof Element && e.target.closest('button'))
            return;
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect)
            return;
        dragRef.current = { pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const moveDrag = (e) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId)
            return;
        const panelWidth = panelRef.current?.getBoundingClientRect().width ?? 480;
        setPosition({
            x: Math.min(Math.max(e.clientX - drag.offsetX, 60 - panelWidth), window.innerWidth - 60),
            y: Math.min(Math.max(e.clientY - drag.offsetY, 0), window.innerHeight - 40),
        });
    };
    const endDrag = (e) => {
        if (dragRef.current?.pointerId === e.pointerId)
            dragRef.current = null;
    };
    const startResize = (e) => {
        if (e.button !== 0)
            return;
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect)
            return;
        if (!position)
            setPosition({ x: rect.left, y: rect.top });
        resizeRef.current = {
            pointerId: e.pointerId,
            startWidth: rect.width,
            startHeight: rect.height,
            startX: e.clientX,
            startY: e.clientY,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const moveResize = (e) => {
        const resize = resizeRef.current;
        if (!resize || resize.pointerId !== e.pointerId)
            return;
        const panelLeft = panelRef.current?.getBoundingClientRect().left ?? 0;
        const panelTop = panelRef.current?.getBoundingClientRect().top ?? 0;
        const maxWidth = Math.max(360, window.innerWidth - panelLeft - 8);
        const maxHeight = Math.max(280, window.innerHeight - panelTop - 8);
        setSize({
            width: Math.min(Math.max(resize.startWidth + e.clientX - resize.startX, 360), maxWidth),
            height: Math.min(Math.max(resize.startHeight + e.clientY - resize.startY, 280), maxHeight),
        });
    };
    const endResize = (e) => {
        if (resizeRef.current?.pointerId === e.pointerId)
            resizeRef.current = null;
    };
    const handlePanelKeyDown = (e) => {
        if (e.target instanceof HTMLInputElement)
            return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            panelRef.current?.focus();
            stepBack();
        }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            panelRef.current?.focus();
            stepForward();
        }
    };
    const panelDocument = () => panelRef.current?.ownerDocument ?? document;
    const openAsWindow = async () => {
        const pipApi = getPictureInPictureApi();
        if (!pipApi || pipWindow)
            return;
        const rect = panelRef.current?.getBoundingClientRect();
        const pip = await pipApi.requestWindow({
            width: Math.round(rect?.width ?? 480),
            height: Math.round(Math.max(rect?.height ?? 0, 560)),
        });
        copyStylesTo(pip.document);
        pip.document.body.style.margin = '0';
        setPipWindow(pip);
    };
    const copyJson = (text) => {
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
    return createPortal(_jsxs("div", { ref: panelRef, role: "dialog", "aria-label": title, tabIndex: -1, className: cx('esd-panel', isWindowed && 'esd-panel-windowed'), style: !isWindowed && (position || size)
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
            : undefined, "data-testid": dataTestId, onKeyDown: handlePanelKeyDown, children: [_jsxs("div", { className: cx('esd-header', isWindowed && 'esd-header-windowed'), onPointerDown: isWindowed ? undefined : startDrag, onPointerMove: isWindowed ? undefined : moveDrag, onPointerUp: isWindowed ? undefined : endDrag, onPointerCancel: isWindowed ? undefined : endDrag, children: [_jsx("span", { className: cx('esd-dot', connectionModifier) }), _jsx("span", { className: "esd-header-title", children: title }), subtitle && _jsx("span", { className: "esd-header-target", children: subtitle }), liveGroupId && _jsxs("span", { className: "esd-header-target", children: ["group ", liveGroupId.slice(0, 8)] }), _jsx("span", { className: cx('esd-badge', badgeModifier), children: badgeText }), !isWindowed && Boolean(getPictureInPictureApi()) && (_jsx("button", { type: "button", className: "esd-control-button", title: "Open as window", "data-testid": `${dataTestId}-open-window`, onClick: openAsWindow, children: "\u29C9" })), isWindowed ? (_jsx("button", { type: "button", className: "esd-control-button", title: "Return to page", "data-testid": `${dataTestId}-return`, onClick: () => pipWindow?.close(), children: "\u21F2" })) : (_jsx("button", { type: "button", className: "esd-control-button", "data-testid": `${dataTestId}-collapse`, onClick: () => setIsOpen(false), children: "\u2014" }))] }), _jsxs("div", { className: "esd-controls", children: [_jsx("button", { type: "button", className: "esd-control-button", title: "First event", onClick: jumpToFirst, disabled: visibleRows.length === 0, children: "\u23EE" }), _jsx("button", { type: "button", className: "esd-control-button", title: "Step back (\u2190)", onClick: stepBack, disabled: visibleRows.length === 0, children: "\u25C1" }), _jsx("button", { type: "button", className: "esd-control-button", title: isPlaying ? 'Pause simulation' : 'Replay stream from this event (original timing)', "data-testid": `${dataTestId}-play`, onClick: togglePlayback, disabled: !isPlaying && (isLive || selectedIndex >= lastIndex), children: isPlaying ? '⏸' : '▶' }), _jsx("button", { type: "button", className: "esd-control-button", title: "Step forward (\u2192)", onClick: stepForward, disabled: visibleRows.length === 0, children: "\u25B7" }), _jsx("button", { type: "button", className: "esd-control-button", title: "Last event", onClick: jumpToLast, disabled: visibleRows.length === 0, children: "\u23ED" }), isLive ? (_jsx("button", { type: "button", className: "esd-control-button", onClick: () => seekTo(lastIndex), disabled: events.length === 0, children: "Pause" })) : (_jsx("button", { type: "button", className: "esd-control-button", onClick: () => seekTo(null), children: "Live" })), _jsx("span", { className: "esd-position", children: events.length ? `#${selectedIndex + 1} / ${events.length}` : 'no events' }), behind > 0 && _jsxs("span", { className: "esd-behind", children: ["+", behind, " new"] })] }), _jsx("div", { className: "esd-slider-row", children: _jsx("input", { type: "range", className: "esd-slider", min: 0, max: Math.max(lastIndex, 0), value: Math.max(selectedIndex, 0), disabled: events.length === 0, onChange: e => seekTo(Number(e.target.value)) }) }), _jsx("div", { className: "esd-chips", children: [...typeCounts.entries()].map(([type, count]) => (_jsxs("button", { type: "button", className: cx('esd-chip', hiddenTypes.has(type) && 'esd-chip-off'), style: { color: typeColors?.[type] }, onClick: () => toggleType(type), children: [type, " ", count] }, type))) }), _jsxs("div", { ref: listRef, className: "esd-list", "data-testid": `${dataTestId}-list`, onScroll: e => setScrollTop(e.currentTarget.scrollTop), children: [visibleRows.length === 0 && _jsx("div", { className: "esd-empty", children: "No events yet" }), _jsx("div", { className: "esd-list-inner", style: { blockSize: visibleRows.length * ROW_HEIGHT }, children: visibleRows.slice(firstRendered, lastRendered).map((row, offset) => {
                            const type = getType(row.recorded.event);
                            return (_jsxs("button", { type: "button", className: cx('esd-row', row.index === selectedIndex && 'esd-row-selected', row.index > selectedIndex && 'esd-row-future'), style: { insetBlockStart: (firstRendered + offset) * ROW_HEIGHT }, onClick: () => seekTo(row.index), children: [_jsx("span", { className: "esd-row-seq", children: row.recorded.seq }), _jsx("span", { className: "esd-row-time", children: formatEventTime(row.recorded.receivedAt) }), _jsx("span", { className: "esd-row-type", style: { color: typeColors?.[type] }, children: type }), _jsx("span", { className: "esd-row-summary", children: summarize?.(row.recorded.event) ?? '' })] }, row.recorded.seq));
                        }) })] }), selected && (_jsxs("div", { className: "esd-detail", children: [_jsxs("div", { className: "esd-detail-meta", children: [(getEventMeta?.(selected) ?? []).map(meta => (_jsx("span", { children: meta }, meta))), _jsxs("span", { children: ["group ", selected.groupId ? selected.groupId.slice(0, 8) : '—'] }), _jsxs("span", { children: ["received ", formatEventTime(selected.receivedAt)] }), _jsx("button", { type: "button", className: "esd-control-button", onClick: () => copyJson(JSON.stringify(selected.event, null, 2)), children: "Copy" })] }), _jsx("pre", { className: "esd-payload", children: JSON.stringify(serializeDetail ? serializeDetail(selected.event) : selected.event, null, 2) })] })), _jsxs("div", { className: "esd-footer", children: [_jsx("button", { type: "button", className: "esd-control-button", onClick: exportEvents, disabled: events.length === 0, children: "Export JSON" }), _jsx("button", { type: "button", className: "esd-control-button", onClick: clear, disabled: events.length === 0, children: "Clear" }), _jsxs("span", { className: "esd-footer-hint", children: [events.length, " events"] })] }), !isWindowed && (_jsx("div", { className: "esd-resize-grip", "data-testid": `${dataTestId}-resize`, onPointerDown: startResize, onPointerMove: moveResize, onPointerUp: endResize, onPointerCancel: endResize }))] }), pipWindow ? pipWindow.document.body : document.body);
};
