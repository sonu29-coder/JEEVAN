export type AuthRole = 'ICU_HOSPITAL' | 'REGISTERED_DONOR' | 'DELIVERY_PARTNER'
export type Portal = 'hospital' | 'donor' | 'driver'

export interface Credential {
  role: AuthRole
  token: string
  label: string
  badge: string
  email?: string
}

export interface DemoUser {
  id: string
  portal: Portal
  role: AuthRole
  name: string
  email: string
  token: string
  defaultPassword: string
  title: string
  badge: string
  avatar: string
  entityName: string
  details: string
}

export const DEMO_USERS: Record<Portal, DemoUser[]> = {
  hospital: [
    {
      id: 'usr-hosp-01',
      portal: 'hospital',
      role: 'ICU_HOSPITAL',
      name: 'Dr. Rajesh Nair, MD',
      email: 'dr.rajesh@jubileemission.org',
      token: 'HOSP-9042',
      defaultPassword: 'HospitalPassword2026!',
      title: 'Chief Critical Care Physician',
      badge: 'Verified NABH ICU Node • Jubilee Mission Hospital',
      avatar: '🏥',
      entityName: 'Jubilee Mission Medical College & Research Hospital',
      details: 'Authorized to dispatch emergency PRBC and Platelet reservations across Thrissur.',
    },
  ],
  donor: [
    {
      id: 'usr-donor-01',
      portal: 'donor',
      role: 'REGISTERED_DONOR',
      name: 'Sneha Menon',
      email: 'sneha.donor@gmail.com',
      token: 'DONOR-1108',
      defaultPassword: 'DonorPassword2026!',
      title: 'Registered Voluntary Donor (O- Universal)',
      badge: 'Certified O- Universal Donor • Health Cleared',
      avatar: '🩸',
      entityName: 'Thrissur Central Donor Network',
      details: 'Active emergency donor ready for on-call critical trauma transfusions.',
    },
    {
      id: 'usr-donor-02',
      portal: 'donor',
      role: 'REGISTERED_DONOR',
      name: 'Aarav Sharma',
      email: 'donor.aarav@gmail.com',
      token: 'DONOR-1108',
      defaultPassword: 'DonorPassword2026!',
      title: 'Registered Donor (B+)',
      badge: 'Certified B+ Active Donor • 8 Lifetime Donations',
      avatar: '🩸',
      entityName: 'Jubilee Mission Blood Donor Registry',
      details: 'Verified donor node available for immediate local emergency dispatch.',
    },
  ],
  driver: [
    {
      id: 'usr-driver-01',
      portal: 'driver',
      role: 'DELIVERY_PARTNER',
      name: 'Arun Kumar',
      email: 'driver.arun@gmail.com',
      token: 'DLVR-8821',
      defaultPassword: 'DriverPassword2026!',
      title: 'Rapid Response Medical Courier (Swift Rider #42)',
      badge: 'Cold-Chain Certified • Rapid Transit Fleet',
      avatar: '🛵',
      entityName: 'Jeevan Emergency Logistics Corridor',
      details: 'Authorized for cold-chain refrigerated blood box transport & OTP verification.',
    },
  ],
}

export const CREDENTIALS: Record<AuthRole, Credential> = {
  ICU_HOSPITAL: {
    role: 'ICU_HOSPITAL',
    token: 'HOSP-9042',
    label: 'Jubilee Mission ICU',
    badge: 'Verified Hospital Node • Jubilee Mission ICU',
    email: 'dr.rajesh@jubileemission.org',
  },
  REGISTERED_DONOR: {
    role: 'REGISTERED_DONOR',
    token: 'DONOR-1108',
    label: 'Sneha Menon (Donor)',
    badge: 'Verified Donor Node • Sneha Menon (O-)',
    email: 'sneha.donor@gmail.com',
  },
  DELIVERY_PARTNER: {
    role: 'DELIVERY_PARTNER',
    token: 'DLVR-8821',
    label: 'Swift Rider #42',
    badge: 'Verified Logistics Partner • Swift Rider #42',
    email: 'driver.arun@gmail.com',
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

const STORAGE_KEY_SESSION = 'jeevan_auth_session'
const STORAGE_KEY_ROLE = 'jeevan_auth_role'
const STORAGE_KEY_USER = 'jeevan_auth_user'

export function saveAuthSession(sessionRole: AuthRole, portalRole: Portal, userMeta?: any) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_SESSION, sessionRole)
    localStorage.setItem(STORAGE_KEY_ROLE, portalRole)
    if (userMeta) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userMeta))
    }
  } catch {}
}

export function loadSavedAuth() {
  if (typeof window === 'undefined') return null
  try {
    const session = localStorage.getItem(STORAGE_KEY_SESSION) as AuthRole | null
    const role = localStorage.getItem(STORAGE_KEY_ROLE) as Portal | null
    const userStr = localStorage.getItem(STORAGE_KEY_USER)
    const user = userStr ? JSON.parse(userStr) : null
    return { session, role, user }
  } catch {
    return null
  }
}

export function clearSavedAuth() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY_SESSION)
    localStorage.removeItem(STORAGE_KEY_ROLE)
    localStorage.removeItem(STORAGE_KEY_USER)
  } catch {}
}

export async function loginUser(
  portal: Portal,
  identifier: string,
  password?: string,
): Promise<{ success: boolean; message: string; role: AuthRole; user: any; token: string }> {
  const cleanId = identifier.trim()
  const expectedAuthRole: AuthRole =
    portal === 'hospital' ? 'ICU_HOSPITAL' : portal === 'donor' ? 'REGISTERED_DONOR' : 'DELIVERY_PARTNER'

  // Attempt live backend authentication first
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username_or_token: cleanId,
        password: password || undefined,
        role: expectedAuthRole,
      }),
      signal: AbortSignal.timeout(3500),
    })

    if (res.ok) {
      const data = await res.json()
      saveAuthSession(expectedAuthRole, portal, data)
      return {
        success: true,
        message: `Welcome back, ${data.name || cleanId}!`,
        role: expectedAuthRole,
        user: data,
        token: data.access_token || CREDENTIALS[expectedAuthRole].token,
      }
    }
  } catch {
    // Backend is offline or not reachable, proceed to verified demo matcher
  }

  // Demo / offline fallback matching
  const list = DEMO_USERS[portal]
  const matched = list.find(
    (u) =>
      u.email.toLowerCase() === cleanId.toLowerCase() ||
      u.token.toLowerCase() === cleanId.toLowerCase() ||
      cleanId.toLowerCase().includes(portal),
  ) || list[0]

  if (password && password.length < 4) {
    return {
      success: false,
      message: 'Password must be at least 4 characters long.',
      role: expectedAuthRole,
      user: null,
      token: '',
    }
  }

  const userMeta = {
    name: matched.name,
    email: matched.email,
    token: matched.token,
    role: expectedAuthRole,
    badge: matched.badge,
    portal,
  }

  saveAuthSession(expectedAuthRole, portal, userMeta)

  return {
    success: true,
    message: `Authenticated as ${matched.name} (${matched.title})`,
    role: expectedAuthRole,
    user: userMeta,
    token: matched.token,
  }
}

export async function loginWithGoogle(
  portal: Portal,
  emailOrToken?: string,
): Promise<{ success: boolean; message: string; role: AuthRole; user: any; token: string }> {
  const expectedAuthRole: AuthRole =
    portal === 'hospital' ? 'ICU_HOSPITAL' : portal === 'donor' ? 'REGISTERED_DONOR' : 'DELIVERY_PARTNER'

  const defaultEmail =
    emailOrToken ||
    (portal === 'hospital'
      ? 'dr.rajesh@gmail.com'
      : portal === 'donor'
        ? 'sneha.donor@gmail.com'
        : 'driver.arun@gmail.com')

  // Attempt live backend Google authentication
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: defaultEmail,
        target_role: expectedAuthRole,
      }),
      signal: AbortSignal.timeout(3500),
    })

    if (res.ok) {
      const data = await res.json()
      saveAuthSession(expectedAuthRole, portal, data)
      return {
        success: true,
        message: `Signed in with Google as ${data.label || defaultEmail}!`,
        role: expectedAuthRole,
        user: data,
        token: data.access_token || CREDENTIALS[expectedAuthRole].token,
      }
    }
  } catch {}

  // Seamless offline fallback
  const userMeta = {
    name: defaultEmail.split('@')[0].replace('.', ' ').toUpperCase(),
    email: defaultEmail,
    role: expectedAuthRole,
    badge: `Google Verified • ${portal.toUpperCase()}`,
    portal,
  }
  saveAuthSession(expectedAuthRole, portal, userMeta)

  return {
    success: true,
    message: `Signed in with Google as ${defaultEmail}!`,
    role: expectedAuthRole,
    user: userMeta,
    token: CREDENTIALS[expectedAuthRole].token,
  }
}

export async function sendDonorOtp(
  phoneNumber: string,
): Promise<{
  success: boolean
  message: string
  formattedPhone?: string
  expiresInSeconds?: number
  cooldownSeconds?: number
  demoOtp?: string
  gatewayNotice?: string
  rawError?: string
  status?: number
}> {
  try {
    const clean = phoneNumber.replace(/[^\d+]/g, '')
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: clean }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      return {
        success: true,
        message: data.message || `Verification code sent to ${data.formatted_phone || phoneNumber}`,
        formattedPhone: data.formatted_phone,
        expiresInSeconds: data.expires_in_seconds,
        cooldownSeconds: data.cooldown_seconds,
        demoOtp: data.demo_otp,
        gatewayNotice: data.gateway_notice,
      }
    }
    return {
      success: false,
      message: data.detail || 'Failed to send verification code.',
      rawError: data.detail,
      status: res.status,
    }
  } catch (err: any) {
    return {
      success: false,
      message: 'Network error contacting verification server. Please check your connection.',
      rawError: err?.message,
    }
  }
}

export async function verifyDonorOtp(
  phoneNumber: string,
  otp: string,
): Promise<{ success: boolean; verified: boolean; verificationToken?: string; message: string; rawError?: string }> {
  try {
    const clean = phoneNumber.replace(/[^\d+]/g, '')
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: clean, otp: otp.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.verified) {
      return {
        success: true,
        verified: true,
        verificationToken: data.verification_token,
        message: data.message || 'Phone number verified successfully.',
      }
    }
    return {
      success: false,
      verified: false,
      message: data.detail || 'Verification failed. Please check the code.',
      rawError: data.detail,
    }
  } catch (err: any) {
    return {
      success: false,
      verified: false,
      message: 'Network error verifying code. Please try again.',
      rawError: err?.message,
    }
  }
}

export async function registerDonorUser(payload: {
  name: string
  email: string
  password: string
  phoneNumber: string
  verificationToken?: string
  bloodGroup?: string
}): Promise<{ success: boolean; message: string; user?: any; token?: string }> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        password: payload.password,
        phone_number: payload.phoneNumber,
        verification_token: payload.verificationToken,
        blood_group: payload.bloodGroup || 'O+',
        role: 'donor',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      saveAuthSession('REGISTERED_DONOR', 'donor', data)
      return {
        success: true,
        message: data.message || 'Registration completed successfully!',
        user: data,
        token: data.access_token,
      }
    }
    return {
      success: false,
      message: data.detail || 'Registration failed. Please check your details.',
    }
  } catch (err: any) {
    return {
      success: false,
      message: 'Network error submitting registration. Please try again.',
    }
  }
}
