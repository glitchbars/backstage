export const DEVICE_PROVIDERS = ['SHELLY', 'SMARTTHINGS'] as const;
export const DEVICE_TYPES = ['SWITCH'] as const;

type DeviceProvider = (typeof DEVICE_PROVIDERS)[number];
type DeviceType = (typeof DEVICE_TYPES)[number];

export interface DeviceInput {
  barId: string;
  name: string;
  provider: DeviceProvider;
  deviceType: DeviceType;
  externalDeviceId: string;
  channel: number;
  enabled: boolean;
}

export function parseDeviceBody(body: unknown): { value: DeviceInput } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Invalid body' };
  const b = body as Record<string, unknown>;

  const barId = typeof b.barId === 'string' ? b.barId.trim() : '';
  if (!barId) return { error: 'barId is required' };

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { error: 'name is required' };

  const externalDeviceId =
    typeof b.externalDeviceId === 'string' ? b.externalDeviceId.trim() : '';
  if (!externalDeviceId) return { error: 'externalDeviceId is required' };
  if (externalDeviceId.length > 255) return { error: 'externalDeviceId is too long' };

  const provider = b.provider as DeviceProvider;
  if (!DEVICE_PROVIDERS.includes(provider)) return { error: 'Invalid provider' };

  const deviceType = b.deviceType as DeviceType;
  if (!DEVICE_TYPES.includes(deviceType)) return { error: 'Invalid deviceType' };

  const channel = Number(b.channel ?? 0);
  if (!Number.isInteger(channel) || channel < 0) return { error: 'channel must be a positive integer' };

  return {
    value: {
      barId,
      name,
      provider,
      deviceType,
      externalDeviceId,
      channel,
      enabled: b.enabled === undefined ? true : Boolean(b.enabled),
    },
  };
}
