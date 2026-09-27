import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

const AUTHORIZE_URL = 'https://api.smartthings.com/oauth/authorize';
const REDIRECT_URI = process.env.SMARTTHINGS_OAUTH_REDIRECT_URI;
const CLIENT_ID = process.env.SMARTTHINGS_CLIENT_ID;

interface ConnectionStatusRow {
  status: string;
  scopes: string;
  accessTokenExpiresAt: Date;
  lastRefreshedAt: Date | null;
  reconnectRequiredAt: Date | null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ barId: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;
  const { barId } = await params;
  const rows = await prisma.$queryRaw<ConnectionStatusRow[]>`SELECT status, scopes, accessTokenExpiresAt, lastRefreshedAt, reconnectRequiredAt
    FROM smartthings_connections WHERE barId = ${barId} LIMIT 1`;
  const connection = rows[0];
  return NextResponse.json(connection ? {
    connected: connection.status === 'CONNECTED',
    ...connection,
    scopes: connection.scopes.split(' ').filter(Boolean),
  } : { connected: false, status: 'DISCONNECTED' });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ barId: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;
  if (!CLIENT_ID || !REDIRECT_URI) {
    return NextResponse.json({ error: 'SmartThings OAuth is not configured' }, { status: 503 });
  }

  const { barId } = await params;
  const bar = await prisma.bar.findUnique({ where: { id: barId }, select: { id: true } });
  if (!bar) return NextResponse.json({ error: 'Bar not found' }, { status: 404 });

  const state = randomBytes(32).toString('base64url');
  const stateHash = createHash('sha256').update(state).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.$executeRaw`INSERT INTO smartthings_oauth_states (stateHash, barId, userId, expiresAt, createdAt)
    VALUES (${stateHash}, ${barId}, ${guard.session.user.id}, ${expiresAt}, NOW(3))`;

  const authorizationUrl = new URL(AUTHORIZE_URL);
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'r:devices:* x:devices:*',
    state,
  }).toString();
  return NextResponse.json({ authorizationUrl: authorizationUrl.toString() });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ barId: string }> }) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;
  const { barId } = await params;
  await prisma.$executeRaw`DELETE FROM smartthings_connections WHERE barId = ${barId}`;
  await prisma.$executeRaw`DELETE FROM smartthings_oauth_states WHERE barId = ${barId}`;
  return new NextResponse(null, { status: 204 });
}