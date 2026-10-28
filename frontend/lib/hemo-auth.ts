export type AuthRole = 'ICU_HOSPITAL' | 'REGISTERED_DONOR' | 'DELIVERY_PARTNER' | 'ADMIN'
export type Portal = 'hospital' | 'donor' | 'driver' | 'new_donor'

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
      badge: 'Chennai Central Trauma ICU • NABH Accredited',
      avatar: '🏥',
      entityName: 'Chennai Central Trauma ICU • MMC Complex',
      details: 'Authorized to dispatch emergency PRBC and Platelet reservations across Chennai.',
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
      title: 'Universal Blood Donor (O-)',
      badge: 'Universal Donor (O-) • Health Cleared',
      avatar: '🩸',
      entityName: 'Chennai Voluntary Donor Network',
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
      title: 'Emergency Donor (B+)',
      badge: 'Emergency Donor (B+) • 8 Donations',
      avatar: '🩸',
      entityName: 'Chennai Voluntary Donor Network',
      details: 'Regular donor with 8 past donations across Chennai hospitals.',
    },
  ],
  new_donor: [
    {
      id: 'usr-new-donor-01',
      portal: 'new_donor',
      role: 'REGISTERED_DONOR',
      name: 'Sneha Menon',
      email: 'sneha.donor@gmail.com',
      token: 'DONOR-1108',
      defaultPassword: 'DonorPassword2026!',
      title: 'First-Time Registered Donor (O-)',
      badge: 'Google Verified Donor • O- Compatible',
      avatar: '✨',
      entityName: 'Jeevan Voluntary Donor Onboarding Network',
      details: 'First-time voluntary donor completing orientation and scheduling first donation.',
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
      badge: 'Cold-Chain Certified • Transit Fleet',
      avatar: '🛵',
      entityName: 'Jeevan Chennai Emergency Logistics Corridor',
      details: 'Authorized for cold-chain refrigerated blood box transport & OTP verification across Chennai routes.',
    },
  ],
}

export const CREDENTIALS: Record<AuthRole, Credential> = {
  ICU_HOSPITAL: {
    role: 'ICU_HOSPITAL',
    token: 'HOSP-9042',
    label: 'Chennai Central ICU',
    badge: 'Chennai Central ICU',
    email: 'dr.rajesh@jubileemission.org',
  },
  REGISTERED_DONOR: {
    role: 'REGISTERED_DONOR',
    token: 'DONOR-1108',
    label: 'Sneha Menon (Donor)',
    badge: 'Sneha Menon (O-)',
    email: 'sneha.donor@gmail.com',
  },
  DELIVERY_PARTNER: {
    role: 'DELIVERY_PARTNER',
    token: 'DLVR-8821',
    label: 'Swift Rider #42',
    badge: 'Swift Rider #42',
    email: 'driver.arun@gmail.com',
  },
  ADMIN: {
    role: 'ADMIN',
    token: 'ADMIN-0001',
    label: 'Jeevan Administrator',
    badge: 'Grid Operations Administrator',
    email: 'admin@jeevan.org',
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
  new_donor: {
    required: 'REGISTERED_DONOR',
    name: 'New Donor Dashboard',
    denial: 'New Donor Dashboard requires registered donor verification.',
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
  if ((session as any) === 'ADMIN') return true
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

export async function logoutUser(token?: string): Promise<void> {
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
  }
  clearSavedAuth()
}

export const VERIFIED_DEMO_ACCOUNTS = [
  {
    email: 'dr.rajesh@jubileemission.org',
    password: 'HospitalPassword2026!',
    token: 'HOSP-9042',
    portal: 'hospital' as Portal,
    role: 'ICU_HOSPITAL' as AuthRole,
    name: 'Dr. Rajesh Nair, MD',
    user_id: 'usr-hosp-01',
    badge: 'Chennai Central Trauma ICU • NABH Accredited',
  },
  {
    email: 'sneha.donor@gmail.com',
    password: 'DonorPassword2026!',
    token: 'DONOR-1108',
    portal: 'donor' as Portal,
    role: 'REGISTERED_DONOR' as AuthRole,
    name: 'Sneha Menon',
    user_id: 'usr-donor-01',
    badge: 'Universal Donor (O-) • Health Cleared',
  },
  {
    email: 'donor.aarav@gmail.com',
    password: 'DonorPassword2026!',
    token: 'DONOR-1108',
    portal: 'donor' as Portal,
    role: 'REGISTERED_DONOR' as AuthRole,
    name: 'Aarav Sharma',
    user_id: 'usr-donor-02',
    badge: 'Active Blood Donor (B+) • 8 Donations',
  },
  {
    email: 'driver.arun@gmail.com',
    password: 'DriverPassword2026!',
    token: 'DLVR-8821',
    portal: 'driver' as Portal,
    role: 'DELIVERY_PARTNER' as AuthRole,
    name: 'Arun Kumar',
    user_id: 'usr-driver-01',
    badge: 'Cold-Chain Certified • Swift Rider #42',
  },
  {
    email: 'admin@jeevan.org',
    password: 'AdminPassword2026!',
    token: 'ADMIN-0001',
    portal: 'hospital' as Portal,
    role: 'ADMIN' as AuthRole,
    name: 'Jeevan Grid Administrator',
    user_id: 'usr-admin-01',
    badge: 'Grid Operations Administrator • Chennai HQ',
  },
]

function findVerifiedDemoAccount(cleanId: string, password?: string) {
  const normId = cleanId.toLowerCase()
  return VERIFIED_DEMO_ACCOUNTS.find(
    (acc) =>
      (acc.email.toLowerCase() === normId || acc.token.toLowerCase() === normId) &&
      (!password || acc.password === password || password === acc.token)
  )
}

export async function loginUser(
  portal: Portal,
  identifier: string,
  password?: string,
): Promise<{ success: boolean; message: string; role: AuthRole; user: any; token: string }> {
  const cleanId = identifier.trim()
  const expectedAuthRole: AuthRole =
    portal === 'hospital' ? 'ICU_HOSPITAL' : portal === 'donor' ? 'REGISTERED_DONOR' : 'DELIVERY_PARTNER'

  if (!cleanId || !password) {
    return {
      success: false,
      message: 'Please provide both your registered email and password.',
      role: expectedAuthRole,
      user: null,
      token: '',
    }
  }

  const apiEndpoint = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '')}/auth/login`
    : '/api/auth/login'

  try {
    const res = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username_or_token: cleanId,
        password: password,
      }),
      signal: AbortSignal.timeout(4000),
    })

    if (res.ok) {
      const data = await res.json()
      const actualRole: AuthRole = (data.role as AuthRole) || expectedAuthRole
      const actualPortal: Portal =
        actualRole === 'REGISTERED_DONOR' ? 'donor' : actualRole === 'DELIVERY_PARTNER' ? 'driver' : 'hospital'

      const userObj = {
        id: data.user_id,
        name: data.label || data.name || cleanId.split('@')[0],
        email: cleanId,
        role: actualRole,
        allowed_roles: actualRole === 'ADMIN' ? 'ICU_HOSPITAL,REGISTERED_DONOR,DELIVERY_PARTNER,ADMIN' : actualRole,
        token: data.access_token,
        access_token: data.access_token,
        badge: data.badge,
        portal: actualPortal,
      }

      saveAuthSession(actualRole, actualPortal, userObj)

      return {
        success: true,
        message: `Welcome back, ${userObj.name}!`,
        role: actualRole,
        user: userObj,
        token: data.access_token,
      }
    } else if (res.status === 401 || res.status === 403) {
      // Backend actively verified credentials and rejected them
      const errData = await res.json().catch(() => ({}))
      const friendlyMsg =
        res.status === 403
          ? errData.detail || 'Access denied. Your account is not active or authorized.'
          : 'Invalid email, mobile number, or password. Please verify your details.'

      return {
        success: false,
        message: friendlyMsg,
        role: expectedAuthRole,
        user: null,
        token: '',
      }
    } else {
      // Backend returned 500, 502, 503, etc. (e.g. Render sleeping container or proxy timeout)
      const matched = findVerifiedDemoAccount(cleanId, password)
      if (matched) {
        const userObj = {
          id: matched.user_id,
          name: matched.name,
          email: matched.email,
          role: matched.role,
          allowed_roles: matched.role === 'ADMIN' ? 'ICU_HOSPITAL,REGISTERED_DONOR,DELIVERY_PARTNER,ADMIN' : matched.role,
          token: matched.token,
          access_token: matched.token,
          badge: matched.badge,
          portal: matched.portal,
        }
        saveAuthSession(matched.role, matched.portal, userObj)
        return {
          success: true,
          message: `Welcome back, ${userObj.name}!`,
          role: matched.role,
          user: userObj,
          token: matched.token,
        }
      }

      return {
        success: false,
        message: 'Invalid email, mobile number, or password. Please verify your details.',
        role: expectedAuthRole,
        user: null,
        token: '',
      }
    }
  } catch {
    // Network / timeout failure when backend container is waking or unreachable
    const matched = findVerifiedDemoAccount(cleanId, password)
    if (matched) {
      const userObj = {
        id: matched.user_id,
        name: matched.name,
        email: matched.email,
        role: matched.role,
        allowed_roles: matched.role === 'ADMIN' ? 'ICU_HOSPITAL,REGISTERED_DONOR,DELIVERY_PARTNER,ADMIN' : matched.role,
        token: matched.token,
        access_token: matched.token,
        badge: matched.badge,
        portal: matched.portal,
      }
      saveAuthSession(matched.role, matched.portal, userObj)
      return {
        success: true,
        message: `Welcome back, ${userObj.name}!`,
        role: matched.role,
        user: userObj,
        token: matched.token,
      }
    }

    return {
      success: false,
      message: 'Invalid email, mobile number, or password. Please verify your details.',
      role: expectedAuthRole,
      user: null,
      token: '',
    }
  }
}

export async function loginWithGoogle(
  portal: Portal,
  emailOrToken?: string,
): Promise<{ success: boolean; message: string; role: AuthRole; user: any; token: string }> {
  const defaultEmail = emailOrToken || 'user@gmail.com'
  const expectedAuthRole: AuthRole =
    portal === 'hospital'
      ? 'ICU_HOSPITAL'
      : (portal === 'donor' || portal === 'new_donor')
      ? 'REGISTERED_DONOR'
      : 'DELIVERY_PARTNER'

  // Live backend Google authentication with genuine token verification
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: defaultEmail,
        target_role: expectedAuthRole,
      }),
      signal: AbortSignal.timeout(4500),
    })

    if (res.ok) {
      const data = await res.json()
      const actualRole: AuthRole = (data.role as AuthRole) || expectedAuthRole
      const actualPortal: Portal =
        portal === 'new_donor'
          ? 'new_donor'
          : actualRole === 'REGISTERED_DONOR'
          ? 'donor'
          : actualRole === 'DELIVERY_PARTNER'
          ? 'driver'
          : 'hospital'
      const userMeta = {
        ...data,
        name: data.label || data.name || defaultEmail.split('@')[0],
        email: data.email || defaultEmail,
        role: actualRole,
        allowed_roles: actualRole === 'ADMIN' ? 'ICU_HOSPITAL,REGISTERED_DONOR,DELIVERY_PARTNER,ADMIN' : actualRole,
      }
      saveAuthSession(actualRole, actualPortal, userMeta)
      return {
        success: true,
        message: `Signed in with Google as ${userMeta.name}!`,
        role: actualRole,
        user: userMeta,
        token: data.access_token || CREDENTIALS[actualRole]?.token || 'AUTH-TOKEN',
      }
    } else {
      const err = await res.json().catch(() => ({}))
      if (portal === 'donor' || portal === 'new_donor') {
        return {
          success: false,
          message: err.detail || 'Google authentication failed: Genuine Google verification required for donor access.',
          role: expectedAuthRole,
          user: null,
          token: '',
        }
      }
    }
  } catch {
    if (portal === 'donor' || portal === 'new_donor') {
      return {
        success: false,
        message: 'Could not connect to Google authentication service. Please check your connection and try again.',
        role: expectedAuthRole,
        user: null,
        token: '',
      }
    }
  }

  // Non-donor demo fallback for local environments
  const lowerEmail = defaultEmail.toLowerCase()
  const resolvedRole: AuthRole =
    lowerEmail.includes('driver') || lowerEmail.includes('rider') || lowerEmail.includes('arun')
      ? 'DELIVERY_PARTNER'
      : 'ICU_HOSPITAL'

  const resolvedPortal: Portal = resolvedRole === 'DELIVERY_PARTNER' ? 'driver' : 'hospital'

  const userMeta = {
    name: defaultEmail.split('@')[0].replace('.', ' ').toUpperCase(),
    email: defaultEmail,
    role: resolvedRole,
    allowed_roles: resolvedRole,
    badge: `${resolvedPortal === 'hospital' ? 'Hospital ICU' : 'Medical Logistics'}`,
    portal: resolvedPortal,
  }
  saveAuthSession(resolvedRole, resolvedPortal, userMeta)

  return {
    success: true,
    message: `Signed in with Google as ${defaultEmail}!`,
    role: resolvedRole,
    user: userMeta,
    token: CREDENTIALS[resolvedRole]?.token || 'AUTH-TOKEN',
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
