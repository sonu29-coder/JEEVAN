export type AuthRole = 'ICU_HOSPITAL' | 'REGISTERED_DONOR' | 'DELIVERY_PARTNER'
export type Portal = 'hospital' | 'donor' | 'driver'

export interface Credential {
  role: AuthRole
  token: string
  label: string
  badge: string
}

export const CREDENTIALS: Record<AuthRole, Credential> = {
  ICU_HOSPITAL: {
    role: 'ICU_HOSPITAL',
    token: 'HOSP-9042',
    label: 'Jubilee Mission ICU',
    badge: 'Verified Hospital Node • Jubilee Mission ICU',
  },
  REGISTERED_DONOR: {
    role: 'REGISTERED_DONOR',
    token: 'DONOR-1108',
    label: 'Aarav (Donor)',
    badge: 'Verified Donor Node • Aarav',
  },
  DELIVERY_PARTNER: {
    role: 'DELIVERY_PARTNER',
    token: 'DLVR-8821',
    label: 'Swift Rider #42',
    badge: 'Verified Logistics Partner • Swift Rider #42',
  },
}

export const CREDENTIAL_LIST = Object.values(CREDENTIALS)

export const PORTAL_ACCESS: Record<Portal, { required: AuthRole; name: string; denial: string; probePath: string }> = {
  hospital: {
    required: 'ICU_HOSPITAL',
    name: 'ICU Dispatch Portal',
    denial: 'ICU Dispatch Portal requires verified Hospital Credentials (NABH / Medical ID).',
    probePath: '/portal/icu',
  },
  donor: {
    required: 'REGISTERED_DONOR',
    name: 'Donor Portal',
    denial: 'Donor Portal requires an active Donor Profile & Health Clearance.',
    probePath: '/portal/donor',
  },
  driver: {
    required: 'DELIVERY_PARTNER',
    name: 'Logistics Hub',
    denial: 'Logistics Hub requires verified Courier Credentials.',
    probePath: '/portal/logistics',
  },
}

export const ROUTE_PERMISSIONS: Record<string, AuthRole> = {
  '/request-blood': 'ICU_HOSPITAL',
  '/reserve-stock': 'ICU_HOSPITAL',
  '/verify-otp': 'ICU_HOSPITAL',
  '/portal/icu': 'ICU_HOSPITAL',
  '/portal/donor': 'REGISTERED_DONOR',
  '/portal/logistics': 'DELIVERY_PARTNER',
}

export function hasPortalAccess(session: AuthRole, portal: Portal) {
  return PORTAL_ACCESS[portal].required === session
}

export function canCallRoute(session: AuthRole, path: string) {
  const required = ROUTE_PERMISSIONS[path]
  return !required || required === session
}
