export const GRID_CENTER: [number, number] = [10.5276, 76.2144]
export const USER_LOCATION: [number, number] = [10.5242, 76.2106]

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
export const COMPONENTS = ['Whole Blood', 'PRBC', 'Platelets'] as const
export const URGENCIES = ['CRITICAL', 'HIGH', 'ROUTINE'] as const

export type BloodGroup = (typeof BLOOD_GROUPS)[number]
export type ComponentType = (typeof COMPONENTS)[number]
export type Urgency = (typeof URGENCIES)[number]

export const COMPONENT_LABELS: Record<ComponentType, string> = {
  'Whole Blood': 'Whole blood',
  PRBC: 'Red cells',
  Platelets: 'Platelets',
}

export const URGENCY_LABELS: Record<Urgency, { title: string; hint: string }> = {
  CRITICAL: { title: 'Critical', hint: 'Within 15 min' },
  HIGH: { title: 'Urgent', hint: 'Within 1 hour' },
  ROUTINE: { title: 'Planned', hint: 'Scheduled' },
}

export const LOCK_DURATION_MS = 15 * 60 * 1000
export const OUR_ICU_ID = 'icu-elite'

export interface Site {
  id: string
  name: string
  short: string
  position: [number, number]
}

export const ICUS: Site[] = [
  { id: 'icu-elite', name: 'Elite Mission Hospital', short: 'Elite Mission', position: [10.5089, 76.2052] },
  { id: 'icu-westfort', name: 'West Fort Hospital', short: 'West Fort', position: [10.5268, 76.1993] },
  { id: 'icu-daya', name: 'Daya General Hospital', short: 'Daya General', position: [10.5376, 76.1764] },
  { id: 'icu-jubilee', name: 'Jubilee Mission Hospital', short: 'Jubilee', position: [10.5149, 76.2291] },
]

export const BANKS: Site[] = [
  { id: 'bank-gmc', name: 'Govt Medical College Blood Bank', short: 'GMC Bank', position: [10.6186, 76.2016] },
  { id: 'bank-jubilee', name: 'Jubilee Mission Blood Centre', short: 'Jubilee Centre', position: [10.5181, 76.2248] },
  { id: 'bank-ima', name: 'IMA Blood Bank Thrissur', short: 'IMA Bank', position: [10.5262, 76.2138] },
  { id: 'bank-amala', name: 'Amala Blood Centre', short: 'Amala Centre', position: [10.5673, 76.1652] },
  { id: 'bank-district', name: 'District Hospital Blood Bank', short: 'District Bank', position: [10.5195, 76.2189] },
]

export interface Donor {
  id: string
  group: BloodGroup
  position: [number, number]
  icuId: string
}

export const DONORS: Donor[] = [
  { id: 'd1', group: 'O-', position: [10.5402, 76.2311], icuId: 'icu-elite' },
  { id: 'd2', group: 'O-', position: [10.4961, 76.2262], icuId: 'icu-elite' },
  { id: 'd3', group: 'B+', position: [10.5531, 76.2042], icuId: 'icu-westfort' },
  { id: 'd4', group: 'B+', position: [10.5092, 76.1826], icuId: 'icu-westfort' },
]

export interface StockItem {
  id: string
  bankId: string
  group: BloodGroup
  component: ComponentType
  units: number
  expiresInDays: number
  lockedByIcuId: string | null
  lockedUntil: number | null
  lockId: string | null
}

export interface Emergency {
  id: string
  icuId: string
  group: BloodGroup
  component: ComponentType
  urgency: Urgency
  units: number
}

export function seedStock(now: number): StockItem[] {
  const free = { lockedByIcuId: null, lockedUntil: null, lockId: null }
  return [
    { id: 's1', bankId: 'bank-ima', group: 'O-', component: 'PRBC', units: 4, expiresInDays: 9, lockedByIcuId: 'icu-westfort', lockedUntil: now + 11 * 60_000 + 23_000, lockId: 'LCK-8F21' },
    { id: 's2', bankId: 'bank-gmc', group: 'O+', component: 'Whole Blood', units: 12, expiresInDays: 14, ...free },
    { id: 's3', bankId: 'bank-jubilee', group: 'A+', component: 'Platelets', units: 6, expiresInDays: 2, ...free },
    { id: 's4', bankId: 'bank-district', group: 'B-', component: 'PRBC', units: 2, expiresInDays: 11, lockedByIcuId: 'icu-daya', lockedUntil: now + 6 * 60_000 + 8_000, lockId: 'LCK-2C9A' },
    { id: 's5', bankId: 'bank-amala', group: 'AB+', component: 'Platelets', units: 3, expiresInDays: 1, ...free },
    { id: 's6', bankId: 'bank-ima', group: 'A-', component: 'Whole Blood', units: 5, expiresInDays: 18, lockedByIcuId: OUR_ICU_ID, lockedUntil: now + 13 * 60_000 + 40_000, lockId: 'LCK-71D4' },
    { id: 's7', bankId: 'bank-gmc', group: 'B+', component: 'PRBC', units: 9, expiresInDays: 3, ...free },
    { id: 's8', bankId: 'bank-jubilee', group: 'AB-', component: 'Whole Blood', units: 1, expiresInDays: 20, ...free },
    { id: 's9', bankId: 'bank-district', group: 'A+', component: 'Whole Blood', units: 12, expiresInDays: 16, ...free },
    { id: 's10', bankId: 'bank-ima', group: 'B+', component: 'Whole Blood', units: 3, expiresInDays: 12, ...free },
  ]
}

export const SEED_EMERGENCIES: Emergency[] = [
  { id: 'REQ-9B17', icuId: 'icu-westfort', group: 'B+', component: 'Whole Blood', urgency: 'HIGH', units: 2 },
  { id: 'REQ-4F2A', icuId: 'icu-elite', group: 'O-', component: 'PRBC', urgency: 'CRITICAL', units: 2 },
  { id: 'REQ-1C8E', icuId: 'icu-daya', group: 'A+', component: 'Platelets', urgency: 'ROUTINE', units: 1 },
]

export const siteById = (sites: Site[], id: string | null) => sites.find((s) => s.id === id)

export function isLocked(item: StockItem, now: number) {
  if (item.lockedUntil === null) return false
  return now === 0 || item.lockedUntil > now
}

const FIXED_OTPS: Record<string, string> = { 'LCK-71D4': '8492' }

/** Deterministic 4-digit handshake code shared by the courier and the receiving hospital. */
export function otpForLock(lockId: string | null) {
  if (!lockId) return '----'
  if (FIXED_OTPS[lockId]) return FIXED_OTPS[lockId]
  let hash = 0
  for (const char of lockId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return String(1000 + (hash % 9000))
}

export function formatRemaining(until: number, now: number) {
  if (now === 0) return '--:--'
  const total = Math.max(0, Math.floor((until - now) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function distanceKm(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

export const TIERS = [
  { id: 1, label: 'Tier 1', range: '0–3 km', max: 3, className: 'bg-mint' },
  { id: 2, label: 'Tier 2', range: '3–7 km', max: 7, className: 'bg-gold' },
  { id: 3, label: 'Tier 3', range: '7–15 km', max: Infinity, className: 'bg-copper' },
] as const

export function tierFor(km: number) {
  return TIERS.find((t) => km <= t.max) ?? TIERS[2]
}
