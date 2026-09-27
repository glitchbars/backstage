import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';
import { parseDeviceBody } from '../validation';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const device = await prisma.barDevice.findUnique({
    where: { id },
    include: { bar: { select: { name: true } } },
  });

  if (!device) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(device);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const parsed = parseDeviceBody(await request.json());
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const existing = await prisma.barDevice.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const duplicate = await prisma.barDevice.findFirst({
    where: {
      barId: parsed.value.barId,
      externalDeviceId: parsed.value.externalDeviceId,
      id: { not: id },
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: 'A device with that external ID already exists for this bar' },
      { status: 409 },
    );
  }

  const device = await prisma.barDevice.update({
    where: { id },
    data: parsed.value as Parameters<typeof prisma.barDevice.update>[0]['data'],
    include: { bar: { select: { name: true } } },
  });

  return NextResponse.json(device);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const existing = await prisma.barDevice.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.barDevice.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
