export interface NavItem {
  label: string
  to: string
  exact?: boolean
  icon: string
  group: string
  description: string
}

export const adminNav: NavItem[] = [
  {
    label: "Dashboard",
    to: "/admin",
    exact: true,
    icon: "D",
    group: "Overview",
    description: "Queues, readiness, and recent activity",
  },
  {
    label: "Ingestion",
    to: "/admin/ingestion",
    icon: "I",
    group: "Operations",
    description: "CSV upload, review, commit, and reversal",
  },
  {
    label: "Artists",
    to: "/admin/artists",
    icon: "A",
    group: "Catalog",
    description: "Artist accounts, invitations, and access",
  },
  {
    label: "Releases",
    to: "/admin/releases",
    icon: "R",
    group: "Catalog",
    description: "Release, track, and collaborator metadata",
  },
  {
    label: "Analytics",
    to: "/admin/analytics",
    icon: "N",
    group: "Catalog",
    description: "Manual metric snapshots and sources",
  },
  {
    label: "Earnings",
    to: "/admin/earnings",
    icon: "$",
    group: "Finance",
    description: "Royalty rows and earnings review",
  },
  {
    label: "Publishing",
    to: "/admin/publishing",
    icon: "P",
    group: "Finance",
    description: "Publishing credits and notes",
  },
  {
    label: "Dues",
    to: "/admin/dues",
    icon: "F",
    group: "Finance",
    description: "Fees, deductions, and settlements",
  },
  {
    label: "Payouts",
    to: "/admin/payouts",
    icon: "W",
    group: "Finance",
    description: "Requests, approvals, and paid marks",
  },
  {
    label: "Settings",
    to: "/admin/settings",
    icon: "S",
    group: "System",
    description: "Channels, locks, archives, and recovery",
  },
]

export const artistNav: NavItem[] = [
  {
    label: "Wallet",
    to: "/dashboard",
    exact: true,
    icon: "W",
    group: "Overview",
    description: "Balance, dues, and payout requests",
  },
  {
    label: "Notifications",
    to: "/dashboard/notifications",
    icon: "N",
    group: "Overview",
    description: "Artist-facing operational messages",
  },
  {
    label: "Analytics",
    to: "/dashboard/analytics",
    icon: "A",
    group: "Catalog",
    description: "Streams, views, and source trends",
  },
  {
    label: "Statements",
    to: "/dashboard/statements",
    icon: "S",
    group: "Finance",
    description: "Monthly royalty statements",
  },
  {
    label: "Releases",
    to: "/dashboard/releases",
    icon: "R",
    group: "Catalog",
    description: "Live catalog and metadata",
  },
  {
    label: "Settings",
    to: "/dashboard/settings",
    icon: "G",
    group: "Account",
    description: "Profile, banking, and publishing setup",
  },
]
