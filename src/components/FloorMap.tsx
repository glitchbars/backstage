'use client';

import Link from 'next/link';

interface FloorMapMesa {
  id: string;
  name: string;
  posX: number | null;
  posY: number | null;
  taken: boolean;
}

interface FloorMapProps {
  mesas: FloorMapMesa[];
}

const CELL = 100;
const GAP = 8;
const PAD = 16;

export function FloorMap({ mesas }: FloorMapProps) {
  const positioned = mesas.filter((m) => m.posX != null && m.posY != null);
  const unpositioned = mesas.filter((m) => m.posX == null || m.posY == null);

  if (positioned.length === 0 && unpositioned.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">No tables in this bar</p>;
  }

  let grid = null;
  if (positioned.length > 0) {
    const xs = positioned.map((m) => m.posX!);
    const ys = positioned.map((m) => m.posY!);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cols = maxX - minX + 1;
    const rows = maxY - minY + 1;
    const containerW = cols * CELL + (cols - 1) * GAP + PAD * 2;
    const containerH = rows * CELL + (rows - 1) * GAP + PAD * 2;

    grid = (
      <div className="relative" style={{ width: containerW, height: containerH }}>
        {positioned.map((mesa) => (
          <Link
            key={mesa.id}
            href={`/mesas/${mesa.id}`}
            style={{
              position: 'absolute',
              width: CELL,
              height: CELL,
              left: (mesa.posX! - minX) * (CELL + GAP) + PAD,
              top: (mesa.posY! - minY) * (CELL + GAP) + PAD,
            }}
            className={`flex items-center justify-center rounded-lg border-2 text-sm font-medium transition-colors hover:opacity-80 ${
              mesa.taken
                ? 'border-red-400 bg-red-50 text-red-700'
                : 'border-green-400 bg-green-50 text-green-700'
            }`}
          >
            {mesa.name}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div>
      {grid && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto">
          {grid}
        </div>
      )}

      {unpositioned.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Unpositioned tables</h3>
          <div className="flex flex-wrap gap-2">
            {unpositioned.map((mesa) => (
              <Link
                key={mesa.id}
                href={`/mesas/${mesa.id}`}
                className={`inline-flex items-center justify-center w-24 h-24 rounded-lg border-2 text-sm font-medium transition-colors hover:opacity-80 ${
                  mesa.taken
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : 'border-green-400 bg-green-50 text-green-700'
                }`}
              >
                {mesa.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
