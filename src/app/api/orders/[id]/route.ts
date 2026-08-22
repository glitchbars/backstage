import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const STAFF_SELECT = { select: { id: true, name: true, gamertag: true } };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;

  const order = await prisma.orderSession.findUnique({
    where: { id },
    include: {
      bar: { select: { id: true, name: true } },
      mesa: { select: { name: true } },
      console: { select: { name: true } },
      createdBy: { select: { id: true, name: true, gamertag: true, email: true } },
      // Unlike the list, the detail view keeps voided lines so the page can show
      // what was struck off and by whom. Totals still ignore them.
      lines: {
        orderBy: { createdAt: 'asc' },
        include: { settledBy: STAFF_SELECT, voidedBy: STAFF_SELECT },
      },
      payments: {
        orderBy: { createdAt: 'asc' },
        include: {
          createdBy: STAFF_SELECT,
          lineLinks: { select: { orderLineId: true } },
        },
      },
      paymentCorrections: {
        orderBy: { createdAt: 'asc' },
        include: { createdBy: STAFF_SELECT },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  return NextResponse.json(order);
}
