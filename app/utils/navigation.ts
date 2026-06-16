import type { Component } from "vue"
import PremiumDuesIcon from "~/components/icons/PremiumDuesIcon.vue"
import PremiumNotificationIcon from "~/components/icons/PremiumNotificationIcon.vue"
import PremiumPayoutIcon from "~/components/icons/PremiumPayoutIcon.vue"
import PremiumReleaseIcon from "~/components/icons/PremiumReleaseIcon.vue"
import PremiumSettingsIcon from "~/components/icons/PremiumSettingsIcon.vue"
import PremiumStatementIcon from "~/components/icons/PremiumStatementIcon.vue"
import PremiumWalletIcon from "~/components/icons/PremiumWalletIcon.vue"
import {
  Banknote,
  BarChart3,
  LayoutDashboard,
  Link2,
  ScrollText,
  UploadCloud,
  Users,
} from "lucide-vue-next"

export interface NavItem {
  label: string
  to: string
  exact?: boolean
  icon: Component
  group: string
  description: string
  locked?: boolean
  lockedTooltip?: string
}

export const adminNav: NavItem[] = [
  {
    label: "Dashboard",
    to: "/admin",
    exact: true,
    icon: LayoutDashboard,
    group: "Overview",
    description: "Queues, readiness, and recent activity",
  },
  {
    label: "Ingestion",
    to: "/admin/ingestion",
    icon: UploadCloud,
    group: "Operations",
    description: "CSV upload, review, commit, and reversal",
  },
  {
    label: "Artists",
    to: "/admin/artists",
    icon: Users,
    group: "Catalog",
    description: "Artist accounts, invitations, and access",
  },
  {
    label: "Releases",
    to: "/admin/releases",
    icon: PremiumReleaseIcon,
    group: "Catalog",
    description: "Release, track, and collaborator metadata",
  },
  {
    label: "Analytics",
    to: "/admin/analytics",
    icon: BarChart3,
    group: "Catalog",
    description: "CSV stream units and source trends",
  },
  {
    label: "NaadLinks",
    to: "/admin/naadlinks",
    icon: Link2,
    group: "Catalog",
    description: "Release smart-link page builder",
  },
  {
    label: "Earnings",
    to: "/admin/earnings",
    icon: Banknote,
    group: "Finance",
    description: "Royalty rows and earnings review",
  },
  {
    label: "Publishing",
    to: "/admin/publishing",
    icon: ScrollText,
    group: "Finance",
    description: "Publishing credits and notes",
  },
  {
    label: "Dues",
    to: "/admin/dues",
    icon: PremiumDuesIcon,
    group: "Finance",
    description: "Fees, deductions, and settlements",
  },
  {
    label: "Payouts",
    to: "/admin/payouts",
    icon: PremiumPayoutIcon,
    group: "Finance",
    description: "Requests, approvals, and paid marks",
  },
  {
    label: "Notifications",
    to: "/admin/notifications",
    icon: PremiumNotificationIcon,
    group: "System",
    description: "Artist actions that need an admin",
  },
  {
    label: "Settings",
    to: "/admin/settings",
    icon: PremiumSettingsIcon,
    group: "System",
    description: "Channels, locks, archives, and recovery",
  },
]

export const artistNav: NavItem[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    exact: true,
    icon: LayoutDashboard,
    group: "Overview",
    description: "Revenue, latest release, and financial activity",
  },
  {
    label: "Wallet",
    to: "/dashboard/wallet",
    icon: PremiumWalletIcon,
    group: "Overview",
    description: "Balance, payout requests, and wallet activity",
  },
  {
    label: "Uploader",
    to: "/dashboard/uploaded",
    icon: UploadCloud,
    group: "Overview",
    description: "Direct distribution and release delivery",
  },
  {
    label: "Analytics",
    to: "/dashboard/analytics",
    icon: BarChart3,
    group: "Catalog",
    description: "Plays, impressions, views, and source trends",
  },
  {
    label: "Statements",
    to: "/dashboard/statements",
    icon: PremiumStatementIcon,
    group: "Finance",
    description: "Monthly royalty statements",
  },
  {
    label: "Releases",
    to: "/dashboard/releases",
    icon: PremiumReleaseIcon,
    group: "Catalog",
    description: "Live catalog and metadata",
  },
  {
    label: "Notifications",
    to: "/dashboard/notifications",
    icon: PremiumNotificationIcon,
    group: "Account",
    description: "Artist-facing operational messages",
  },
  {
    label: "Settings",
    to: "/dashboard/settings",
    icon: PremiumSettingsIcon,
    group: "Account",
    description: "Profile, banking, and publishing setup",
  },
]
