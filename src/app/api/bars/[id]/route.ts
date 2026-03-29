import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const bar = await prisma.bar.findUnique({ where: { id }, include: { address: true } });

  if (!bar) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(bar);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await request.json();
  const {
    name,
    streetAddress,
    streetAddress2,
    postalCode,
    city,
    region,
    countryCode,
    phoneNumber,
  } = body;

  const existing = await prisma.bar.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const bar = await prisma.$transaction(async (tx) => {
    await tx.address.update({
      where: { id: existing.addressId },
      data: { streetAddress, streetAddress2, postalCode, city, region, countryCode, phoneNumber },
    });
    return tx.bar.update({ where: { id }, data: { name }, include: { address: true } });
  });

  return NextResponse.json(bar);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await params;
  const bar = await prisma.bar.findUnique({ where: { id } });
  if (!bar) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.bar.delete({ where: { id } });
    await tx.address.delete({ where: { id: bar.addressId } });
  });

  return new NextResponse(null, { status: 204 });
}
