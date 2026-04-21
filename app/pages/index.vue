<script setup lang="ts">
const modules = [
  "Admin-owned catalog and payout operations",
  "Immediate CSV ingestion with review before commit",
  "Artist wallet and statements driven from immutable financial rows",
  "Supabase auth, storage, and RLS as the system boundary",
]

const buildOrder = [
  "Apply the database migration and helper views in Supabase.",
  "Provision admin and artist accounts against the new schema.",
  "Implement the signed upload handshake for CSV ingestion.",
  "Commit wallet and payout actions against the transaction ledger.",
]
</script>

<template>
  <div class="page stack-lg">
    <section class="hero">
      <div class="hero-copy card">
        <p class="chip">Royalty operations foundation</p>
        <h1>Naad Backstage is ready to move from planning into build.</h1>
        <p class="muted-copy">
          The app scaffold, route shells, auth wiring, and Supabase migration now define the first working
          implementation layer. Next up is account provisioning, ingestion, and ledger-backed actions.
        </p>

        <div class="button-row">
          <NuxtLink to="/login" class="button">Open login</NuxtLink>
          <NuxtLink to="/admin" class="button button-secondary">View admin shell</NuxtLink>
        </div>
      </div>

      <div class="hero-panel">
        <div class="hero-stat">
          <span class="eyebrow">Stack</span>
          <strong class="stat-value">Nuxt 3 + Supabase</strong>
          <span class="detail-copy">Vercel-safe file flow, DB-first money rules, and role-based access.</span>
        </div>
        <div class="hero-stat">
          <span class="eyebrow">Rule</span>
          <strong class="stat-value">Postgres only</strong>
          <span class="detail-copy">All wallet and statement math stays in the database layer.</span>
        </div>
        <div class="hero-stat">
          <span class="eyebrow">Next milestone</span>
          <strong class="stat-value">Ingestion flow</strong>
          <span class="detail-copy">Upload, preview, commit, and reverse without breaking ledger integrity.</span>
        </div>
      </div>
    </section>

    <div class="split-grid">
      <SectionCard
        title="What is in this pass"
        eyebrow="Foundation"
        description="The project is no longer just docs. These are the system slices now represented in code."
      >
        <ul class="list">
          <li v-for="item in modules" :key="item">{{ item }}</li>
        </ul>
      </SectionCard>

      <SectionCard
        title="What should happen next"
        eyebrow="Execution order"
        description="The highest-leverage sequence keeps auth, ingestion, and wallet rules from drifting apart."
      >
        <ol class="list">
          <li v-for="item in buildOrder" :key="item">{{ item }}</li>
        </ol>
      </SectionCard>
    </div>
  </div>
</template>
