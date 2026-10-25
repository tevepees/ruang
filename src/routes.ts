export const navigation = ['Office', 'Org Flow', 'Agents', 'Usage', 'Task Board', 'Calendar', 'Activity', 'Memory', 'Folders', 'Logs', 'Settings'] as const
// ponytail: Ruang 3D (Office) restored to navigation.
export const archived = [] as const
export type Page = typeof navigation[number] | typeof archived[number]

/** The page shown when the address names no page (or an unknown one). */
export const HOME: Page = 'Office'

export function pageSlug(page: Page): string {
  return page.toLowerCase().replace(/\s+/g, '-')
}

export function pageFromHash(hash: string): Page {
  const slug = hash.replace(/^#\/?/, '').split('/')[0].toLowerCase()
  if (slug === 'knowledge') return 'Memory'
  // The Dashboard's statistics now live in the Office HUD and panel.
  if (slug === 'dashboard') return HOME
  return [...navigation, ...archived].find((page) => pageSlug(page) === slug) ?? HOME
}
