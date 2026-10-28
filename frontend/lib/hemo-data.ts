export const GRID_CENTER: [number, number] = [13.0827, 80.2707] // Chennai Central
export const USER_LOCATION: [number, number] = [13.0418, 80.2341] // T. Nagar, Chennai

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
  { id: 'icu-elite', name: 'Kilpauk Medical College Hospital', short: 'Kilpauk MCH', position: [13.0784, 80.2415] },
  { id: 'icu-westfort', name: 'Anna Nagar Superspeciality Hospital', short: 'Anna Nagar SSH', position: [13.0850, 80.2101] },
  { id: 'icu-daya', name: 'Porur Emergency Care Centre', short: 'Porur ECC', position: [13.0382, 80.1565] },
  { id: 'icu-jubilee', name: 'Apollo Greams Trauma ICU', short: 'Greams Trauma', position: [13.0528, 80.2508] },
]

export const BANKS: Site[] = [
  { id: 'bank-gmc', name: 'Madras Medical College Blood Bank', short: 'MMC Blood Bank', position: [13.0836, 80.2775] },
  { id: 'bank-jubilee', name: 'Mylapore Lions Blood Centre', short: 'Mylapore Lions', position: [13.0368, 80.2676] },
  { id: 'bank-ima', name: 'Red Cross Blood Centre Chennai', short: 'Red Cross Chennai', position: [13.0680, 80.2480] },
  { id: 'bank-amala', name: 'Ambattur Rotaract Blood Bank', short: 'Ambattur Blood', position: [13.1143, 80.1548] },
  { id: 'bank-district', name: 'Guindy Regional Blood Bank', short: 'Guindy Regional', position: [13.0067, 80.2025] },
]

export interface Donor {
  id: string
  group: BloodGroup
  position: [number, number]
  icuId: string
}

export const DONORS: Donor[] = [
  { id: 'd1', group: 'O-', position: [13.0600, 80.2400], icuId: 'icu-elite' },
  { id: 'd2', group: 'O-', position: [13.0450, 80.2300], icuId: 'icu-elite' },
  { id: 'd3', group: 'B+', position: [13.0800, 80.2150], icuId: 'icu-westfort' },
  { id: 'd4', group: 'B+', position: [13.0350, 80.1600], icuId: 'icu-westfort' },
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
  clinicalReason?: string
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

export interface ClinicalRuleBadge {
  id: string
  title: string
  severity: 'critical' | 'warning' | 'info'
  description: string
  clinicalAction: string
  badge: string
}

export interface ExpiryRadarUnit {
  id: string
  bankId: string
  bankName: string
  group: BloodGroup
  component: ComponentType
  units: number
  availableUnits: number
  expiresInDays: number
  expiresInHours: number
  expiryDateStr: string
  urgencyTier: 'CRITICAL' | 'WARNING' | 'MONITORING' | 'SAFE' | 'EXPIRED'
  fefoPriorityRank: number
  pediatricSafe: boolean
  traumaCandidate: boolean
  clinicalRules: ClinicalRuleBadge[]
  suggestedAction: string
  recommendedTransferTargetId?: string
  recommendedTransferTargetName?: string
  radarAngleDeg: number
  radarRadiusNorm: number
}

export function computeExpiryRadarUnits(stock: StockItem[], now: number): ExpiryRadarUnit[] {
  const sorted = [...stock].sort((a, b) => a.expiresInDays - b.expiresInDays)

  return sorted.map((s, index) => {
    const bank = siteById(BANKS, s.bankId)
    const days = s.expiresInDays
    const hours = Math.max(0, days * 24)
    const targetDate = new Date(now + days * 86400000)
    const expiryDateStr = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    let urgencyTier: ExpiryRadarUnit['urgencyTier'] = 'SAFE'
    let suggestedAction = 'Standard storage reserve.'
    if (days <= 0) {
      urgencyTier = 'EXPIRED'
      suggestedAction = 'Biohazard Quarantine: Discard unit and update regulatory audit log.'
    } else if (days <= 2 || (s.component === 'Platelets' && days <= 3)) {
      urgencyTier = 'CRITICAL'
      suggestedAction = "Immediate FEFO Issue: Prioritize today's urgent surgery, MTP, or dispatch emergency transfer."
    } else if (days <= 5) {
      urgencyTier = 'WARNING'
      suggestedAction = 'FEFO Priority Queue: Allocate to scheduled elective surgeries or high-turnover procedures.'
    } else if (days <= 10) {
      urgencyTier = 'MONITORING'
      suggestedAction = 'Active Shelf-Life Watch: Monitor inventory burn rate.'
    }

    const rules: ClinicalRuleBadge[] = []
    let pediatricSafe = true
    let traumaCandidate = false
    let targetId: string | undefined = undefined
    let targetName: string | undefined = undefined

    // 1. FEFO Rule
    if (days >= 0 && days <= 5 && s.units > 0) {
      rules.push({
        id: 'FEFO_PRIORITY',
        title: 'FEFO Priority Allocation',
        severity: days <= 2 ? 'critical' : 'warning',
        description: 'First Expiring First Out protocol: must be dispensed before newer stock to prevent spoilage.',
        clinicalAction: 'Pre-assign to imminent surgical cases or urgent trauma request.',
        badge: 'FEFO Priority',
      })
    }

    // 2. Platelet Shelf-Life Rule
    if (s.component === 'Platelets') {
      if (days <= 2) {
        rules.push({
          id: 'PLATELET_URGENT_CYCLE',
          title: 'Platelet Rapid Spoilage Alert',
          severity: 'critical',
          description: 'Platelets have a maximum 5-day shelf life with continuous agitation. Bacterial proliferation risk increases sharply.',
          clinicalAction: 'Immediate issue to oncology, hematology, or surgical ward with active thrombocytopenia.',
          badge: 'Platelet Alert',
        })
      }
    }

    // 3. Pediatric & Neonatal Safety Exclusion Rule
    if (s.component === 'PRBC' || s.component === 'Whole Blood') {
      if (days <= 28) {
        pediatricSafe = false
        rules.push({
          id: 'PEDIATRIC_RESTRICTION',
          title: 'Pediatric / Neonatal Restriction',
          severity: 'warning',
          description: 'Storage duration >7 days. Stored red cells accumulate extracellular potassium and lose 2,3-DPG; contraindicated for neonatal exchange.',
          clinicalAction: 'Restrict utilization strictly to adult surgical and medical recipients.',
          badge: 'Adults Only',
        })
      }
    }

    // 4. Immediate Trauma / Massive Transfusion Match
    if ((s.component === 'PRBC' || s.component === 'Whole Blood') && days >= 0 && days <= 7 && s.units > 0) {
      traumaCandidate = true
      rules.push({
        id: 'TRAUMA_MASSIVE_MATCH',
        title: 'Trauma / MTP Candidate',
        severity: 'info',
        description: 'Approved for immediate acute trauma resuscitation or Massive Transfusion Protocol (MTP), where immediate infusion eliminates shelf-life risk.',
        clinicalAction: 'Hold ready for emergency trauma bay activation.',
        badge: 'Trauma MTP',
      })
    }

    // 5. Inter-Facility Redistribution Recommendation
    if (days >= 0 && days <= 4 && s.units > 0) {
      if (s.bankId !== 'bank-gmc') {
        targetId = 'bank-gmc'
        targetName = 'Madras Medical College Blood Bank'
      } else {
        targetId = 'bank-jubilee'
        targetName = 'Mylapore Lions Blood Centre'
      }
      rules.push({
        id: 'INTER_FACILITY_TRANSFER_RECOMMENDED',
        title: 'Inter-Hospital Redistribution Recommended',
        severity: days <= 2 ? 'warning' : 'info',
        description: `Local surplus approaching expiry. Inter-facility transfer to ${targetName} prevents discarding.`,
        clinicalAction: 'Initiate Green Corridor cold-chain transfer dispatch.',
        badge: 'Transfer Rec',
      })
    }

    const radarAngleDeg = (index * 47) % 360
    const clampedDays = Math.max(0, Math.min(20, days))
    const radarRadiusNorm = 0.18 + (clampedDays / 20) * 0.72

    return {
      id: s.id,
      bankId: s.bankId,
      bankName: bank?.name ?? 'Regional Blood Centre',
      group: s.group,
      component: s.component,
      units: s.units,
      availableUnits: s.units,
      expiresInDays: days,
      expiresInHours: hours,
      expiryDateStr,
      urgencyTier,
      fefoPriorityRank: index + 1,
      pediatricSafe,
      traumaCandidate,
      clinicalRules: rules,
      suggestedAction,
      recommendedTransferTargetId: targetId,
      recommendedTransferTargetName: targetName,
      radarAngleDeg,
      radarRadiusNorm,
    }
  })
}

// =====================================================================
// Clinical Blood Component Storage Limits & Expiry Standards
// =====================================================================

export interface ComponentStorageLimit {
  component: string
  label: string
  maxDays: number
  maxMonths: number
  tempRange: string
  preservative: string
  regulatorySource: string
  description: string
}

export const CLINICAL_STORAGE_LIMITS: Record<string, ComponentStorageLimit> = {
  PRBC: {
    component: 'PRBC',
    label: 'Packed Red Blood Cells',
    maxDays: 42,
    maxMonths: 1.4,
    tempRange: '2°C to 6°C',
    preservative: 'SAGM / Adsol (AS-1, AS-3)',
    regulatorySource: 'AABB & DGHS National Blood Transfusion Council',
    description: 'Packed Red Blood Cells stored at 2-6°C up to 42 days (approx. 1.4 months).',
  },
  'Whole Blood': {
    component: 'Whole Blood',
    label: 'Whole Blood',
    maxDays: 35,
    maxMonths: 1.15,
    tempRange: '2°C to 6°C',
    preservative: 'CPDA-1 Solution',
    regulatorySource: 'AABB & DGHS National Blood Transfusion Council',
    description: 'Whole blood stored at 2-6°C up to 35 days (approx. 1.15 months).',
  },
  Platelets: {
    component: 'Platelets',
    label: 'Platelets (RDP / SDP)',
    maxDays: 5,
    maxMonths: 0.16,
    tempRange: '20°C to 24°C with continuous agitation',
    preservative: 'Platelet Additive Solution (PAS) / Plasma',
    regulatorySource: 'AABB & DGHS National Blood Transfusion Council',
    description: 'Platelets stored with gentle continuous agitation at room temp up to 5 days.',
  },
  Plasma: {
    component: 'Plasma',
    label: 'Fresh Frozen Plasma (FFP)',
    maxDays: 365,
    maxMonths: 12.0,
    tempRange: '≤ -18°C frozen',
    preservative: 'Citrate Phosphate Dextrose (CPD)',
    regulatorySource: 'AABB & DGHS National Blood Transfusion Council',
    description: 'Fresh Frozen Plasma frozen within 8 hours, stored up to 12 months at ≤ -18°C.',
  },
  FFP: {
    component: 'FFP',
    label: 'Fresh Frozen Plasma',
    maxDays: 365,
    maxMonths: 12.0,
    tempRange: '≤ -18°C frozen',
    preservative: 'Citrate Phosphate Dextrose (CPD)',
    regulatorySource: 'AABB & DGHS National Blood Transfusion Council',
    description: 'Fresh Frozen Plasma stored up to 12 months at ≤ -18°C or colder.',
  },
  Cryoprecipitate: {
    component: 'Cryoprecipitate',
    label: 'Cryoprecipitated AHF',
    maxDays: 365,
    maxMonths: 12.0,
    tempRange: '≤ -18°C frozen',
    preservative: 'Factor VIII & Fibrinogen Concentrate',
    regulatorySource: 'AABB & DGHS National Blood Transfusion Council',
    description: 'Cryoprecipitate stored up to 12 months at ≤ -18°C or colder.',
  },
}

// =====================================================================
// Rare Blood Group Compatibility & Matching Algorithm
// =====================================================================

export interface RareBloodDefinition {
  group: string
  label: string
  rarity: string
  prevalenceIndia: string
  compatibleDonors: string[]
  exactMatch: string
  ruleSummary: string
  clinicalGuidelines: string
}

export const RARE_BLOOD_DEFINITIONS: Record<string, RareBloodDefinition> = {
  'O-': {
    group: 'O-',
    label: 'O Negative',
    rarity: 'High',
    prevalenceIndia: '~1.5% in Indian population',
    compatibleDonors: ['O-'],
    exactMatch: 'O-',
    ruleSummary: 'O- patients carry strong anti-A and anti-B antibodies without Rh(D). Compatible ONLY with O- red cells.',
    clinicalGuidelines: 'Universal red blood cell donor, but strictly restricted to receiving O- units.',
  },
  'A-': {
    group: 'A-',
    label: 'A Negative',
    rarity: 'High',
    prevalenceIndia: '~0.5% in Indian population',
    compatibleDonors: ['A-', 'O-'],
    exactMatch: 'A-',
    ruleSummary: 'A- patients can receive A- (preferred exact match to conserve O-) and O- (universal donor).',
    clinicalGuidelines: 'Exact A- match prioritized to conserve universal O- supply for emergencies.',
  },
  'B-': {
    group: 'B-',
    label: 'B Negative',
    rarity: 'High',
    prevalenceIndia: '~1.8% in Indian population',
    compatibleDonors: ['B-', 'O-'],
    exactMatch: 'B-',
    ruleSummary: 'B- patients can receive B- (preferred exact match to conserve O-) and O- (universal donor).',
    clinicalGuidelines: 'Exact B- match prioritized to conserve emergency O- stock.',
  },
  'AB-': {
    group: 'AB-',
    label: 'AB Negative',
    rarity: 'Very High',
    prevalenceIndia: '<0.3% in Indian population (Rarest standard ABO group)',
    compatibleDonors: ['AB-', 'A-', 'B-', 'O-'],
    exactMatch: 'AB-',
    ruleSummary: 'AB- can receive AB-, A-, B-, or O-. AB- exact match prioritized to conserve negative reserves.',
    clinicalGuidelines: 'Universal plasma donor; rarest standard red cell recipient.',
  },
  'Bombay Oh': {
    group: 'Bombay Oh',
    label: 'Bombay Blood Group (Oh phenotype)',
    rarity: 'Extremely Rare',
    prevalenceIndia: '1 in 10,000 in India (discovered in Mumbai; carries anti-H)',
    compatibleDonors: ['Bombay Oh'],
    exactMatch: 'Bombay Oh',
    ruleSummary: 'Lacks H antigen and carries anti-H antibodies. Cannot receive O, A, B, or AB. Compatible ONLY with Bombay Oh donors.',
    clinicalGuidelines: 'Critical emergency: requires contacting National Rare Donor Registry or regional cryopreserved stock.',
  },
  'Rh-null': {
    group: 'Rh-null',
    label: 'Rh-null (Golden Blood)',
    rarity: 'Ultra Rare',
    prevalenceIndia: '<50 known individuals worldwide',
    compatibleDonors: ['Rh-null'],
    exactMatch: 'Rh-null',
    ruleSummary: 'Lacks all 61 Rh antigens. Can receive ONLY Rh-null red cells due to potential anti-Rh antibodies.',
    clinicalGuidelines: 'Requires autologous pre-donation or international rare donor exchange.',
  },
}

