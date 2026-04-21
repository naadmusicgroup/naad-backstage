export interface NavItem {
  label: string
  to: string
  exact?: boolean
}

export const adminNav: NavItem[] = [
  { label: "Dashboard", to: "/admin", exact: true },
  { label: "Ingestion", to: "/admin/ingestion" },
  { label: "Artists", to: "/admin/artists" },
  { label: "Releases", to: "/admin/releases" },
  { label: "Payouts", to: "/admin/payouts" },
  { label: "Settings", to: "/admin/settings" },
]

export const artistNav: NavItem[] = [
  { label: "Wallet", to: "/dashboard", exact: true },
  { label: "Analytics", to: "/dashboard/analytics" },
  { label: "Statements", to: "/dashboard/statements" },
  { label: "Releases", to: "/dashboard/releases" },
  { label: "Settings", to: "/dashboard/settings" },
]
