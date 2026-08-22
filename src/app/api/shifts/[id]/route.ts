import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';
import {
  SHIFT_INCLUDE,
  SHIFT_STATUSES,
  ShiftStatus,
  overlappingShiftWhere,
  parseShiftTimes,
} from '@/lib/shifts';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const shift = await prisma.employeeShift.findUnique({ where: { id }, include: SHIFT_INCLUDE });

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 });

  return NextResponse.json(shift);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await request.json();
  const { barId, employeeId, role, notes, status } = body as {
    barId?: string;
    employeeId?: string;
    role?: string;
    notes?: string;
    status?: string;
  };

  if (!barId || !employeeId) {
    return NextResponse.json({ error: 'barId and employeeId are required' }, { status: 400 });
  }

  if (!SHIFT_STATUSES.includes(status as ShiftStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const times = parseShiftTimes(body);
  if ('error' in times) return NextResponse.json({ error: times.error }, { status: 400 });

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  // excludeId keeps a shift from clashing with itself when only the notes or
  // the role are being edited.
  const clash = await prisma.employeeShift.findFirst({
    where: overlappingShiftWhere({ employeeId, ...times, excludeId: id }),
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: 'That employee is already scheduled during those hours' },
      { status: 409 },
    );
  }

  const shift = await prisma.employeeShift.update({
    where: { id },
    data: {
      barId,
      employeeId,
      ...times,
      role: role?.trim() || null,
      notes: notes?.trim() || null,
      status: status as ShiftStatus,
    },
    include: SHIFT_INCLUDE,
  });

  return NextResponse.json(shift);
}

// A hard delete, unlike most of the app: EmployeeShift has no deletedAt column
// and nothing references its rows, so a scrapped shift leaves nothing behind.
// Cancelling instead of deleting is what the CANCELLED status is for.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  await prisma.employeeShift.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
