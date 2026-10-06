import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const { id } = await params;
    const discount = await prisma.discount.findUnique({
        where: { id },
        include: { bar: { select: { name: true } } },
    });

    if (!discount || discount.deletedAt) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(discount);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const { id } = await params;
    const body = await request.json();
    const { barId, name, percentBps, active } = body;

    if (percentBps !== undefined && (!Number.isInteger(percentBps) || percentBps <= 0 || percentBps > 10000)) {
        return NextResponse.json(
            { error: 'percentBps must be an integer between 1 and 10000' },
            { status: 400 },
        );
    }

    const discount = await prisma.discount.update({
        where: { id },
        data: {
            ...(barId !== undefined ? { barId } : {}),
            ...(name !== undefined ? { name: String(name).trim() } : {}),
            ...(percentBps !== undefined ? { percentBps } : {}),
            ...(active !== undefined ? { active } : {}),
        },
        include: { bar: { select: { name: true } } },
    });

    return NextResponse.json(discount);
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const { id } = await params;
    // Soft delete: existing order lines keep their snapshot of this discount.
    await prisma.discount.update({ where: { id }, data: { deletedAt: new Date(), active: false } });

    return new NextResponse(null, { status: 204 });
}
