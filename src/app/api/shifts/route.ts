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

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const barId = searchParams.get('barId') ?? undefined;
  const employeeId = searchParams.get('employeeId') ?? undefined;
  const statusParam = searchParams.get('status');
  const status = SHIFT_STATUSES.includes(statusParam as ShiftStatus)
    ? (statusParam as ShiftStatus)
    : undefined;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') ?? 20)));
  const skip = (page - 1) * pageSize;

  // from/to arrive as absolute instants, not calendar days: bars trade past
  // midnight and each has its own timezone, so the client decides where a day
  // starts and this only ever compares points in time.
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const range = {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };

  const where = {
    ...(barId ? { barId } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(status ? { status } : {}),
    ...(from || to ? { scheduledStart: range } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.employeeShift.findMany({
      where,
      skip,
      take: pageSize,
      include: SHIFT_INCLUDE,
      orderBy: { scheduledStart: 'desc' },
    }),
    prisma.employeeShift.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

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

  const times = parseShiftTimes(body);
  if ('error' in times) return NextResponse.json({ error: times.error }, { status: 400 });

  // relationMode is "prisma", so no foreign key stops a shift pointing at a
  // user or a bar that isn't there — the rows have to be checked by hand.
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const clash = await prisma.employeeShift.findFirst({
    where: overlappingShiftWhere({ employeeId, ...times }),
    include: SHIFT_INCLUDE,
  });
  if (clash) {
    return NextResponse.json(
      { error: 'That employee is already scheduled during those hours' },
      { status: 409 },
    );
  }

  const shift = await prisma.employeeShift.create({
    data: {
      barId,
      employeeId,
      ...times,
      role: role?.trim() || null,
      notes: notes?.trim() || null,
      status: SHIFT_STATUSES.includes(status as ShiftStatus)
        ? (status as ShiftStatus)
        : 'SCHEDULED',
      createdById: guard.session.user.id,
    },
    include: SHIFT_INCLUDE,
  });

  return NextResponse.json(shift, { status: 201 });
}
