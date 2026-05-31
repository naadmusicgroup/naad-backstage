import type { SupabaseClient } from "@supabase/supabase-js"
import Decimal from "decimal.js"
import { toMoneyString } from "~~/server/utils/money"
import { throwSupabaseError } from "~~/server/utils/supabase-pagination"
import type { AdminPayoutArtistOption } from "~~/types/payouts"

interface ActiveArtistRow {
  id: string
  name: string | null
}

interface ArtistWalletRow {
  artist_id: string
  available_balance: string | number | null
  pending_payouts: string | number | null
  approved_payouts: string | number | null
  total_withdrawn: string | number | null
}

export async function loadAdminPayoutArtistOptions(supabase: SupabaseClient<any>): Promise<AdminPayoutArtistOption[]> {
  const { data: artistRows, error: artistError } = await supabase
    .from("artists")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .order("id", { ascending: true })

  throwSupabaseError(artistError, "Unable to load payout artists.")

  const artists = (artistRows ?? []) as ActiveArtistRow[]
  const artistIds = artists.map((artist) => artist.id)

  if (!artistIds.length) {
    return []
  }

  const { data: walletRows, error: walletError } = await supabase
    .from("artist_wallet")
    .select("artist_id, available_balance, pending_payouts, approved_payouts, total_withdrawn")
    .in("artist_id", artistIds)

  throwSupabaseError(walletError, "Unable to load payout artist balances.")

  const walletByArtistId = new Map(
    ((walletRows ?? []) as ArtistWalletRow[]).map((wallet) => [wallet.artist_id, wallet]),
  )

  return artists.map((artist) => {
    const wallet = walletByArtistId.get(artist.id)
    const availableBalance = new Decimal(wallet?.available_balance ?? 0)

    return {
      value: artist.id,
      label: artist.name ?? "Unknown artist",
      availableBalance: toMoneyString(availableBalance),
      visibleBalance: toMoneyString(Decimal.max(availableBalance, 0)),
      pendingPayouts: toMoneyString(wallet?.pending_payouts),
      approvedPayouts: toMoneyString(wallet?.approved_payouts),
      totalWithdrawn: toMoneyString(wallet?.total_withdrawn),
    }
  })
}
