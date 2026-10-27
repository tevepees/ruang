export interface DivisionInfo {
  id: string
  name: string
  shortLabel: string
  badgeColor: string
  rugColor: string
  description: string
  profiles: string[]
}

export const DIVISIONS: Record<string, DivisionInfo> = {
  executive: {
    id: 'executive',
    name: 'Executive Suite',
    shortLabel: 'EXEC',
    badgeColor: '#3b82f6',
    rugColor: '#1e3a8a',
    description: 'Governance, Strategic Alignment, & Capital Allocation',
    profiles: ['default', 'general-manager', 'risk-compliance', 'bendahara'],
  },
  operations: {
    id: 'operations',
    name: 'Pabrik & Operasional',
    shortLabel: 'OPS',
    badgeColor: '#f59e0b',
    rugColor: '#78350f',
    description: 'Produksi Cocopeat, QC, Packing WMS, & Maintenance',
    profiles: ['admin-produksi', 'quality-control', 'checker-packing', 'data-entry', 'procurement', 'maintenance'],
  },
  commercial: {
    id: 'commercial',
    name: 'Komersial & Pasar Ekspor',
    shortLabel: 'SALES',
    badgeColor: '#10b981',
    rugColor: '#064e3b',
    description: 'Riset Lead Global, Cold Outreach B2B, & Regulasi',
    profiles: ['market-potential', 'leads-approach', 'market-intel', 'regulasi-ekspor', 'admin-kantor'],
  },
  creative: {
    id: 'creative',
    name: 'Studio Media & Growth',
    shortLabel: 'GROWTH',
    badgeColor: '#8b5cf6',
    rugColor: '#4c1d95',
    description: 'Editorial B2B, Desain Visual, Sosmed & Ads',
    profiles: ['editor-market', 'desain-visual', 'sosmed-organik', 'seo-organic', 'sosmed-ads'],
  },
  support: {
    id: 'support',
    name: 'CS & Logistik Hub',
    shortLabel: 'SUPPORT',
    badgeColor: '#06b6d4',
    rugColor: '#164e63',
    description: 'CS WhatsApp, Retur, & Ekspedisi Tracking',
    profiles: ['cs-order', 'cs-komplain', 'ekspedisi-tracker', 'dhila', 'rdk-agent'],
  },
}

export const DIVISION_LIST: DivisionInfo[] = [
  DIVISIONS.executive,
  DIVISIONS.operations,
  DIVISIONS.commercial,
  DIVISIONS.creative,
  DIVISIONS.support,
]

export function getDivisionForProfile(profileId: string): DivisionInfo {
  for (const div of DIVISION_LIST) {
    if (div.profiles.includes(profileId)) return div
  }
  return DIVISIONS.support
}
