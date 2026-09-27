'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export const FLOOR_MAP_ITEM_TYPES = ['wall', 'door', 'toilet', 'sink', 'tv', 'table', 'seat', 'stool', 'sofa'] as const;

export type FloorMapItemType = (typeof FLOOR_MAP_ITEM_TYPES)[number];

export interface FloorMapItem {
    id: string;
    type: FloorMapItemType;
    label: string;
    posX: number;
    posY: number;
    width: number;
    height: number;
}

const GRID_COLUMNS = 140;
const GRID_ROWS = 90;
const CELL_SIZE = 24;
const BOARD_WIDTH = GRID_COLUMNS * CELL_SIZE;
const BOARD_HEIGHT = GRID_ROWS * CELL_SIZE;
const DEFAULT_VIEWPORT_WIDTH = 1200;
const MIN_VIEWPORT_WIDTH = 320;
const VIEWPORT_HEIGHT = 720;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 3.6;

const TYPE_STYLES: Record<FloorMapItemType, { backgroundColor: string; borderColor: string; textColor: string }> = {
    wall: { backgroundColor: '#111827', borderColor: '#111827', textColor: '#f9fafb' },
    door: { backgroundColor: '#fde68a', borderColor: '#f59e0b', textColor: '#92400e' },
    toilet: { backgroundColor: '#dbeafe', borderColor: '#3b82f6', textColor: '#1d4ed8' },
    sink: { backgroundColor: '#d1fae5', borderColor: '#10b981', textColor: '#047857' },
    tv: { backgroundColor: '#fee2e2', borderColor: '#ef4444', textColor: '#b91c1c' },
    table: { backgroundColor: '#ede9fe', borderColor: '#8b5cf6', textColor: '#6d28d9' },
    seat: { backgroundColor: '#fef3c7', borderColor: '#f59e0b', textColor: '#78350f' },
    stool: { backgroundColor: '#d2d2d2', borderColor: '#111827', textColor: '#111827' },
    sofa: { backgroundColor: '#e0f2fe', borderColor: '#3b82f6', textColor: '#1e40af' },
};

const DEFAULT_SIZE: Record<FloorMapItemType, { width: number; height: number }> = {
    wall: { width: 3, height: 1 },
    door: { width: 1, height: 1 },
    toilet: { width: 1, height: 1 },
    sink: { width: 1, height: 1 },
    tv: { width: 2, height: 1 },
    table: { width: 4, height: 3 },
    seat: { width: 1, height: 1 },
    stool: { width: 1, height: 1 },
    sofa: { width: 2, height: 1 },

};

function createId() {
    return `item_${Math.random().toString(36).slice(2, 10)}`;
}

function isFloorMapItemType(value: unknown): value is FloorMapItemType {
    return typeof value === 'string' && FLOOR_MAP_ITEM_TYPES.includes(value as FloorMapItemType);
}

function normalizeFloorMap(value: unknown): FloorMapItem[] {
    const rawItems = Array.isArray(value)
        ? value
        : value && typeof value === 'object' && Array.isArray((value as { items?: unknown[] }).items)
            ? (value as { items: unknown[] }).items
            : [];

    return rawItems
        .map((item) => item as Partial<FloorMapItem>)
        .filter(
            (item): item is FloorMapItem =>
                !!item &&
                typeof item.id === 'string' &&
                isFloorMapItemType(item.type) &&
                typeof item.label === 'string' &&
                Number.isInteger(item.posX) &&
                Number.isInteger(item.posY) &&
                Number.isInteger(item.width) &&
                Number.isInteger(item.height),
        );
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function itemOverlaps(a: FloorMapItem, b: FloorMapItem) {
    return (
        a.posX < b.posX + b.width &&
        a.posX + a.width > b.posX &&
        a.posY < b.posY + b.height &&
        a.posY + a.height > b.posY
    );
}

function findOpenPosition(items: FloorMapItem[], size: { width: number; height: number }) {
    for (let y = 0; y <= GRID_ROWS - size.height; y += 1) {
        for (let x = 0; x <= GRID_COLUMNS - size.width; x += 1) {
            const candidate: FloorMapItem = {
                id: '__candidate__',
                type: 'table',
                label: '',
                posX: x,
                posY: y,
                width: size.width,
                height: size.height,
            };
            const collision = items.some((item) => itemOverlaps(item, candidate));
            if (!collision) return { x, y };
        }
    }

    return {
        x: clamp(Math.floor(items.length % GRID_COLUMNS), 0, GRID_COLUMNS - size.width),
        y: clamp(Math.floor(items.length / GRID_COLUMNS), 0, GRID_ROWS - size.height),
    };
}

function getContentBounds(items: FloorMapItem[]) {
    if (items.length === 0) {
        return { minX: 0, minY: 0, maxX: 30, maxY: 20 };
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    items.forEach((item) => {
        minX = Math.min(minX, item.posX);
        minY = Math.min(minY, item.posY);
        maxX = Math.max(maxX, item.posX + item.width);
        maxY = Math.max(maxY, item.posY + item.height);
    });

    return {
        minX,
        minY,
        maxX,
        maxY,
    };
}

export function normalizeBarFloorMap(value: unknown): FloorMapItem[] {
    return normalizeFloorMap(value);
}

export function BarFloorMapEditor({
    value,
    onChange,
    barId,
}: {
    value: FloorMapItem[];
    onChange: (items: FloorMapItem[]) => void;
    barId?: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const iconCacheRef = useRef<Partial<Record<FloorMapItemType, HTMLImageElement>>>({});
    const mesaNameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>(value[0]?.id ? [value[0].id] : []);
    const [interactionState, setInteractionState] = useState<
        | {
            mode: 'drag-items';
            itemIds: string[];
            anchorGridX: number;
            anchorGridY: number;
            startPositions: Record<string, { posX: number; posY: number; width: number; height: number }>;
        }
        | {
            mode: 'pan';
            pointerStartX: number;
            pointerStartY: number;
            startOffsetX: number;
            startOffsetY: number;
        }
        | {
            mode: 'marquee';
            startLocalX: number;
            startLocalY: number;
            currentLocalX: number;
            currentLocalY: number;
        }
        | null
    >(null);
    const [view, setView] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
    const [iconsReadyTick, setIconsReadyTick] = useState(0);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [newType, setNewType] = useState<FloorMapItemType>('wall');
    const [newLabel, setNewLabel] = useState('Wall');
    const [viewportWidth, setViewportWidth] = useState(DEFAULT_VIEWPORT_WIDTH);

    // The canvas has no intrinsic layout width, so it has to be told one. Measuring the
    // wrapper keeps it inside the card instead of pushing the whole page sideways.
    useEffect(() => {
        const node = viewportRef.current;
        if (!node) return;

        const observer = new ResizeObserver(([entry]) => {
            setViewportWidth(Math.max(MIN_VIEWPORT_WIDTH, Math.round(entry.contentRect.width)));
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    const selectedItem = useMemo(() => {
        if (selectedIds.length !== 1) return null;
        return value.find((item) => item.id === selectedIds[0]) ?? null;
    }, [selectedIds, value]);

    useEffect(() => {
        const existing = new Set(value.map((item) => item.id));
        const filtered = selectedIds.filter((id) => existing.has(id));
        if (filtered.length !== selectedIds.length) {
            setSelectedIds(filtered.length > 0 ? filtered : value[0]?.id ? [value[0].id] : []);
        }
    }, [selectedIds, value]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const tagName = target?.tagName?.toLowerCase();
            const inInput =
                tagName === 'input' ||
                tagName === 'textarea' ||
                tagName === 'select' ||
                !!target?.isContentEditable;
            if (inInput) return;

            if (event.key === ' ') {
                setIsSpacePressed(true);
            }

            if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
                event.preventDefault();
                const selectedSet = new Set(selectedIds);
                if (barId) {
                    value.forEach((item) => {
                        if (selectedSet.has(item.id) && item.type === 'table') {
                            fetch(`/api/mesas/${item.id}`, { method: 'DELETE' }).catch(() => { });
                        }
                    });
                }
                const remaining = value.filter((item) => !selectedSet.has(item.id));
                onChange(remaining);
                setSelectedIds(remaining[0]?.id ? [remaining[0].id] : []);
                return;
            }

            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                setSelectedIds(value.map((item) => item.id));
                return;
            }

            if (event.key === 'Escape') {
                setInteractionState(null);
                setSelectedIds([]);
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key === ' ') {
                setIsSpacePressed(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [onChange, selectedIds, value]);

    useEffect(() => {
        if (value.length > 0) return;

        // Start zoomed out enough to see a useful planning area.
        const initialScale = 0.7;
        const initialOffsetX = 48;
        const initialOffsetY = 48;
        setView({ scale: initialScale, offsetX: initialOffsetX, offsetY: initialOffsetY });
    }, [value.length]);

    useEffect(() => {
        const entries = Object.entries(buildIconSvgByType()) as Array<[FloorMapItemType, string]>;

        entries.forEach(([type, svg]) => {
            if (iconCacheRef.current[type] || type === "wall") return;
            const image = new Image();
            image.onload = () => {
                iconCacheRef.current[type] = image;
                setIconsReadyTick((tick) => tick + 1);
            };
            image.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
        });
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewportWidth * dpr;
        canvas.height = VIEWPORT_HEIGHT * dpr;
        canvas.style.width = `${viewportWidth}px`;
        canvas.style.height = `${VIEWPORT_HEIGHT}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.clearRect(0, 0, viewportWidth, VIEWPORT_HEIGHT);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewportWidth, VIEWPORT_HEIGHT);

        ctx.save();
        ctx.translate(view.offsetX, view.offsetY);
        ctx.scale(view.scale, view.scale);

        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        for (let col = 0; col <= GRID_COLUMNS; col += 1) {
            const x = col * CELL_SIZE + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, BOARD_HEIGHT);
            ctx.stroke();
        }
        for (let row = 0; row <= GRID_ROWS; row += 1) {
            const y = row * CELL_SIZE + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(BOARD_WIDTH, y);
            ctx.stroke();
        }

        value.forEach((item) => {
            const typeStyle = TYPE_STYLES[item.type];
            const x = item.posX * CELL_SIZE;
            const y = item.posY * CELL_SIZE;
            const width = item.width * CELL_SIZE;
            const height = item.height * CELL_SIZE;
            const radius = 10;
            const selected = selectedIds.includes(item.id);

            ctx.save();
            if (selected) {
                ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
                ctx.shadowBlur = 14;
                ctx.shadowOffsetY = 5;
            }

            drawRoundedRect(ctx, x + 2, y + 2, width - 4, height - 4, radius);
            ctx.fillStyle = typeStyle.backgroundColor;
            ctx.fill();
            ctx.lineWidth = selected ? 3 : 2;
            ctx.strokeStyle = selected ? '#0f172a' : typeStyle.borderColor;
            ctx.stroke();
            ctx.restore();

            ctx.fillStyle = typeStyle.textColor;

            const icon = iconCacheRef.current[item.type];
            if (item.type !== 'table' && icon) {
                const iconSize = Math.max(16, Math.min(width, height) * 0.54);
                ctx.drawImage(icon, x + width / 2 - iconSize / 2, y + height / 2 - iconSize / 2, iconSize, iconSize);
            }

            if (item.type === 'table') {
                ctx.font = '700 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const text = (item.label || item.type).toUpperCase();
                const maxTextWidth = Math.max(width - 12, 20);
                const displayed = truncateText(ctx, text, maxTextWidth);
                ctx.fillText(displayed, x + width / 2, y + height / 2);
            }
        });

        ctx.restore();

        if (interactionState?.mode === 'marquee') {
            const x = Math.min(interactionState.startLocalX, interactionState.currentLocalX);
            const y = Math.min(interactionState.startLocalY, interactionState.currentLocalY);
            const width = Math.abs(interactionState.startLocalX - interactionState.currentLocalX);
            const height = Math.abs(interactionState.startLocalY - interactionState.currentLocalY);
            ctx.save();
            ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
            ctx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
            ctx.lineWidth = 1.5;
            ctx.fillRect(x, y, width, height);
            ctx.strokeRect(x, y, width, height);
            ctx.restore();
        }
    }, [iconsReadyTick, interactionState, selectedIds, value, view, viewportWidth]);

    useEffect(() => {
        if (!interactionState) return;

        const handlePointerMove = (event: PointerEvent) => {
            if (interactionState.mode === 'pan') {
                const deltaX = event.clientX - interactionState.pointerStartX;
                const deltaY = event.clientY - interactionState.pointerStartY;
                setView((prev) => ({
                    ...prev,
                    offsetX: interactionState.startOffsetX + deltaX,
                    offsetY: interactionState.startOffsetY + deltaY,
                }));
                return;
            }

            if (interactionState.mode === 'marquee') {
                const point = toBoardPoint(event.clientX, event.clientY, canvasRef.current, view);
                if (!point) return;
                setInteractionState((prev) =>
                    prev?.mode === 'marquee'
                        ? { ...prev, currentLocalX: point.localX, currentLocalY: point.localY }
                        : prev,
                );
                return;
            }

            const point = toBoardPoint(event.clientX, event.clientY, canvasRef.current, view);
            if (!point) return;

            const dxRaw = Math.round(point.gridX - interactionState.anchorGridX);
            const dyRaw = Math.round(point.gridY - interactionState.anchorGridY);

            let minDx = Number.NEGATIVE_INFINITY;
            let maxDx = Number.POSITIVE_INFINITY;
            let minDy = Number.NEGATIVE_INFINITY;
            let maxDy = Number.POSITIVE_INFINITY;
            interactionState.itemIds.forEach((id) => {
                const start = interactionState.startPositions[id];
                if (!start) return;
                minDx = Math.max(minDx, -start.posX);
                maxDx = Math.min(maxDx, GRID_COLUMNS - (start.posX + start.width));
                minDy = Math.max(minDy, -start.posY);
                maxDy = Math.min(maxDy, GRID_ROWS - (start.posY + start.height));
            });

            const dx = clamp(dxRaw, minDx, maxDx);
            const dy = clamp(dyRaw, minDy, maxDy);

            const startMap = interactionState.startPositions;
            onChange(
                value.map((item) => {
                    const start = startMap[item.id];
                    if (!start) return item;
                    return { ...item, posX: start.posX + dx, posY: start.posY + dy };
                }),
            );
        };

        const handlePointerUp = () => {
            if (interactionState.mode === 'marquee') {
                const x1 = Math.min(interactionState.startLocalX, interactionState.currentLocalX);
                const y1 = Math.min(interactionState.startLocalY, interactionState.currentLocalY);
                const x2 = Math.max(interactionState.startLocalX, interactionState.currentLocalX);
                const y2 = Math.max(interactionState.startLocalY, interactionState.currentLocalY);

                const worldLeft = (x1 - view.offsetX) / view.scale;
                const worldTop = (y1 - view.offsetY) / view.scale;
                const worldRight = (x2 - view.offsetX) / view.scale;
                const worldBottom = (y2 - view.offsetY) / view.scale;

                const selected = value
                    .filter((item) => {
                        const left = item.posX * CELL_SIZE;
                        const top = item.posY * CELL_SIZE;
                        const right = left + item.width * CELL_SIZE;
                        const bottom = top + item.height * CELL_SIZE;
                        return left < worldRight && right > worldLeft && top < worldBottom && bottom > worldTop;
                    })
                    .map((item) => item.id);

                setSelectedIds(selected);
            }

            setInteractionState(null);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [interactionState, onChange, value, view]);

    function updateItem(id: string, patch: Partial<FloorMapItem>) {
        onChange(
            value.map((item) => {
                if (item.id !== id) return item;

                const next = { ...item, ...patch };
                return {
                    ...next,
                    posX: clamp(next.posX, 0, GRID_COLUMNS - next.width),
                    posY: clamp(next.posY, 0, GRID_ROWS - next.height),
                    width: clamp(next.width, 1, GRID_COLUMNS),
                    height: clamp(next.height, 1, GRID_ROWS),
                };
            }),
        );

        // Debounce Mesa name sync when label changes on a table item
        if (patch.label !== undefined && barId) {
            const item = value.find((i) => i.id === id);
            if (item?.type === 'table') {
                if (mesaNameTimerRef.current) clearTimeout(mesaNameTimerRef.current);
                mesaNameTimerRef.current = setTimeout(() => {
                    fetch(`/api/mesas/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: patch.label }),
                    }).catch(() => { });
                }, 600);
            }
        }
    }

    async function addItem() {
        const size = DEFAULT_SIZE[newType];
        const open = findOpenPosition(value, size);
        const label = newLabel.trim() || newType;

        let id = createId();
        if (newType === 'table' && barId) {
            try {
                const res = await fetch('/api/mesas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ barId, name: label, posX: open.x, posY: open.y }),
                });
                if (res.ok) {
                    const mesa = await res.json() as { id: string };
                    id = mesa.id;
                }
            } catch {
                // fall back to local id if the request fails
            }
        }

        const nextItem: FloorMapItem = {
            id,
            type: newType,
            label,
            posX: open.x,
            posY: open.y,
            ...size,
        };

        onChange([...value, nextItem]);
        setSelectedIds([nextItem.id]);
    }

    function deleteItem(id: string) {
        if (barId) {
            const item = value.find((i) => i.id === id);
            if (item?.type === 'table') {
                fetch(`/api/mesas/${id}`, { method: 'DELETE' }).catch(() => { });
            }
        }
        const nextItems = value.filter((item) => item.id !== id);
        onChange(nextItems);
        setSelectedIds(nextItems[0]?.id ? [nextItems[0].id] : []);
    }

    function deleteSelectedItems() {
        if (selectedIds.length === 0) return;
        const selectedSet = new Set(selectedIds);
        if (barId) {
            value.forEach((item) => {
                if (selectedSet.has(item.id) && item.type === 'table') {
                    fetch(`/api/mesas/${item.id}`, { method: 'DELETE' }).catch(() => { });
                }
            });
        }
        const remaining = value.filter((item) => !selectedSet.has(item.id));
        onChange(remaining);
        setSelectedIds(remaining[0]?.id ? [remaining[0].id] : []);
    }

    function fitToContent() {
        const bounds = getContentBounds(value);
        const contentWidth = Math.max((bounds.maxX - bounds.minX) * CELL_SIZE, CELL_SIZE * 10);
        const contentHeight = Math.max((bounds.maxY - bounds.minY) * CELL_SIZE, CELL_SIZE * 8);
        const pad = 120;

        const nextScale = clamp(
            Math.min((viewportWidth - pad) / contentWidth, (VIEWPORT_HEIGHT - pad) / contentHeight),
            MIN_ZOOM,
            MAX_ZOOM,
        );

        const worldCenterX = ((bounds.minX + bounds.maxX) / 2) * CELL_SIZE;
        const worldCenterY = ((bounds.minY + bounds.maxY) / 2) * CELL_SIZE;
        setView({
            scale: nextScale,
            offsetX: viewportWidth / 2 - worldCenterX * nextScale,
            offsetY: VIEWPORT_HEIGHT / 2 - worldCenterY * nextScale,
        });
    }

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Type</label>
                        <select
                            value={newType}
                            onChange={(e) => {
                                const nextType = e.target.value as FloorMapItemType;
                                setNewType(nextType);
                                setNewLabel(nextType);
                            }}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                        >
                            {FLOOR_MAP_ITEM_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Label</label>
                        <input
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={addItem}
                        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                    >
                        Add item
                    </button>
                </div>

                <div className="min-w-0 rounded-3xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs text-gray-500">Drag objects to move, drag empty space for blue-box select, hold Space/Alt to pan, wheel to zoom.</p>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setView((prev) => ({
                                        ...prev,
                                        scale: clamp(Number((prev.scale - 0.2).toFixed(2)), MIN_ZOOM, MAX_ZOOM),
                                    }))
                                }
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                            >
                                -
                            </button>
                            <span className="w-12 text-center text-xs font-medium text-gray-600">{Math.round(view.scale * 100)}%</span>
                            <button
                                type="button"
                                onClick={() =>
                                    setView((prev) => ({
                                        ...prev,
                                        scale: clamp(Number((prev.scale + 0.2).toFixed(2)), MIN_ZOOM, MAX_ZOOM),
                                    }))
                                }
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                            >
                                +
                            </button>
                            <button
                                type="button"
                                onClick={() => setView({ scale: 1, offsetX: 0, offsetY: 0 })}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                            >
                                Reset view
                            </button>
                            <button
                                type="button"
                                onClick={fitToContent}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                            >
                                Fit
                            </button>
                        </div>
                    </div>
                    <div ref={viewportRef} className="min-w-0">
                    <canvas
                        ref={canvasRef}
                        className="block touch-none rounded-2xl border border-gray-100 bg-white shadow-sm"
                        width={viewportWidth}
                        height={VIEWPORT_HEIGHT}
                        onWheel={(event) => {
                            event.preventDefault();
                            const point = toBoardPoint(event.clientX, event.clientY, canvasRef.current, view);
                            if (!point) return;

                            const zoomDirection = event.deltaY > 0 ? -1 : 1;
                            const nextScale = clamp(
                                Number((view.scale + zoomDirection * 0.12).toFixed(2)),
                                MIN_ZOOM,
                                MAX_ZOOM,
                            );

                            const nextOffsetX = point.localX - point.worldX * nextScale;
                            const nextOffsetY = point.localY - point.worldY * nextScale;

                            setView({ scale: nextScale, offsetX: nextOffsetX, offsetY: nextOffsetY });
                        }}
                        onPointerDown={(event) => {
                            const point = toBoardPoint(event.clientX, event.clientY, canvasRef.current, view);
                            if (!point) return;

                            const hit = [...value].reverse().find((item) =>
                                point.gridX >= item.posX &&
                                point.gridX <= item.posX + item.width &&
                                point.gridY >= item.posY &&
                                point.gridY <= item.posY + item.height,
                            );

                            if (!hit) {
                                if (event.altKey || isSpacePressed || event.button === 1) {
                                    setInteractionState({
                                        mode: 'pan',
                                        pointerStartX: event.clientX,
                                        pointerStartY: event.clientY,
                                        startOffsetX: view.offsetX,
                                        startOffsetY: view.offsetY,
                                    });
                                } else {
                                    setInteractionState({
                                        mode: 'marquee',
                                        startLocalX: point.localX,
                                        startLocalY: point.localY,
                                        currentLocalX: point.localX,
                                        currentLocalY: point.localY,
                                    });
                                }
                                return;
                            }

                            const nextSelected = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
                            setSelectedIds(nextSelected);
                            const startPositions: Record<string, { posX: number; posY: number; width: number; height: number }> = {};
                            value.forEach((item) => {
                                if (nextSelected.includes(item.id)) {
                                    startPositions[item.id] = {
                                        posX: item.posX,
                                        posY: item.posY,
                                        width: item.width,
                                        height: item.height,
                                    };
                                }
                            });
                            setInteractionState({
                                mode: 'drag-items',
                                itemIds: nextSelected,
                                anchorGridX: point.gridX,
                                anchorGridY: point.gridY,
                                startPositions,
                            });
                        }}
                    >
                        Canvas map editor
                    </canvas>
                    </div>
                </div>
            </div>

            <div className="min-w-0 space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">Selected item</h3>
                    <p className="text-xs text-gray-500">Drag items on the map or edit the fields below.</p>
                    <p className="mt-1 text-[11px] text-gray-400">Shortcuts: Delete/Backspace removes selected, Cmd/Ctrl+A selects all, Esc clears selection.</p>
                    <p className="mt-1 text-[11px] text-gray-400">
                        Canvas size: {GRID_COLUMNS} x {GRID_ROWS} cells, built for multi-room venues.
                    </p>
                </div>

                {selectedIds.length > 1 ? (
                    <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                        <p className="text-sm font-medium text-blue-900">{selectedIds.length} items selected</p>
                        <p className="text-xs text-blue-700">Drag any selected item to move the full group.</p>
                        <button
                            type="button"
                            onClick={deleteSelectedItems}
                            className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                        >
                            Delete selected
                        </button>
                    </div>
                ) : selectedItem ? (
                    <>
                        <div>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Type</label>
                            <select
                                value={selectedItem.type}
                                onChange={(e) => updateItem(selectedItem.id, { type: e.target.value as FloorMapItemType })}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                            >
                                {FLOOR_MAP_ITEM_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Label</label>
                            <input
                                value={selectedItem.label}
                                onChange={(e) => updateItem(selectedItem.id, { label: e.target.value })}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">X</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={GRID_COLUMNS - 1}
                                    value={selectedItem.posX}
                                    onChange={(e) => updateItem(selectedItem.id, { posX: Number(e.target.value) })}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Y</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={GRID_ROWS - 1}
                                    value={selectedItem.posY}
                                    onChange={(e) => updateItem(selectedItem.id, { posY: Number(e.target.value) })}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Width</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={GRID_COLUMNS}
                                    value={selectedItem.width}
                                    onChange={(e) => updateItem(selectedItem.id, { width: Number(e.target.value) })}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Height</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={GRID_ROWS}
                                    value={selectedItem.height}
                                    onChange={(e) => updateItem(selectedItem.id, { height: Number(e.target.value) })}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                                />
                            </div>
                        </div>

                        <div className="flex justify-between gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => deleteItem(selectedItem.id)}
                                className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                            >
                                Delete
                            </button>
                            <button
                                type="button"
                                onClick={() => updateItem(selectedItem.id, { ...DEFAULT_SIZE[selectedItem.type] })}
                                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Reset size
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">
                        Add an item to start building the map.
                    </div>
                )}
            </div>
        </div>
    );
}

function toBoardPoint(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement | null,
    view: { scale: number; offsetX: number; offsetY: number },
) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null;

    const worldX = (localX - view.offsetX) / view.scale;
    const worldY = (localY - view.offsetY) / view.scale;

    return {
        localX,
        localY,
        worldX,
        worldY,
        gridX: worldX / CELL_SIZE,
        gridY: worldY / CELL_SIZE,
    };
}

function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let output = text;
    while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
        output = output.slice(0, -1);
    }
    return `${output}...`;
}

function buildIconSvgByType(): Record<FloorMapItemType, string> {
    return {
        wall: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="8" y="18" width="48" height="28" rx="4" fill="#111827"/><path d="M8 28h48M8 38h48M20 18v10M32 18v10M44 18v10" stroke="#f9fafb" stroke-width="3"/></svg>`,
        door: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="14" y="8" width="36" height="48" rx="4" fill="#f59e0b"/><rect x="20" y="14" width="24" height="36" fill="#fde68a"/><circle cx="38" cy="33" r="2.8" fill="#92400e"/></svg>`,
        toilet: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="31" cy="14" rx="13" ry="7" fill="#3b82f6"/><rect x="18" y="14" width="26" height="17" rx="5" fill="#bfdbfe"/><path d="M18 30h28c0 9-7 17-15 17s-13-7-13-17z" fill="#dbeafe" stroke="#3b82f6" stroke-width="3"/><rect x="24" y="47" width="14" height="8" rx="3" fill="#93c5fd"/></svg>`,
        sink: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="9" y="10" width="46" height="13" rx="4" fill="#10b981"/><path d="M14 24h36c0 11-8 20-18 20S14 35 14 24z" fill="#d1fae5" stroke="#10b981" stroke-width="3"/><circle cx="32" cy="32" r="4" fill="#34d399"/><path d="M32 52v6M24 58h16" stroke="#047857" stroke-width="4" stroke-linecap="round"/></svg>`,
        tv: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="8" y="13" width="48" height="32" rx="5" fill="#111827"/><rect x="13" y="18" width="38" height="22" rx="2" fill="#ef4444"/><path d="M19 49h26M24 49l-3 7M40 49l3 7" stroke="#991b1b" stroke-width="3" stroke-linecap="round"/></svg>`,
        seat: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="14" y="18" width="36" height="24" rx="6" fill="#f97316"/><path d="M18 42v10M46 42v10" stroke="#c2410c" stroke-width="4" stroke-linecap="round"/></svg>`,
        sofa: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="8" y="18" width="48" height="24" rx="6" fill="#facc15"/><path d="M12 42v10M52 42v10" stroke="#ca8a04" stroke-width="4" stroke-linecap="round"/></svg>`,
        stool: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="22" y="18" width="20" height="24" rx="6" fill="#14b8a6"/><path d="M26 42v10M38 42v10" stroke="#0f766e" stroke-width="4" stroke-linecap="round"/></svg>`,
        table: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="14" y="18" width="36" height="24" rx="6" fill="#8b5cf6"/><path d="M18 42v10M46 42v10" stroke="#6d28d9" stroke-width="4" stroke-linecap="round"/></svg>`,
    };
}