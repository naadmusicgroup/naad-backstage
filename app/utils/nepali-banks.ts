export type NepaliBankCategory = "commercial" | "development"

export interface NepaliBankOption {
  name: string
  countryCode: "NP"
  category: NepaliBankCategory
  websiteDomain: string | null
  logoUrl: string | null
  aliases?: readonly string[]
}

function bankLogoUrl(slug: string): string {
  return `/bank-logos/${slug}.png`
}

function bank(
  domain: string | null,
  name: string,
  category: NepaliBankCategory,
  aliases: readonly string[] = [],
  logoUrl: string | null = null,
): NepaliBankOption {
  return {
    name,
    countryCode: "NP",
    category,
    websiteDomain: domain,
    logoUrl,
    aliases,
  }
}

export const NEPALI_COMMERCIAL_BANKS: readonly NepaliBankOption[] = [
  bank("nepalbank.com.np", "Nepal Bank Ltd.", "commercial", [], bankLogoUrl("nepal-bank")),
  bank("adbl.gov.np", "Agriculture Development Bank Ltd.", "commercial", ["ADBL"], bankLogoUrl("agriculture-development-bank")),
  bank("nabilbank.com", "Nabil Bank Ltd.", "commercial", [], bankLogoUrl("nabil-bank")),
  bank("nimb.com.np", "Nepal Investment Mega Bank Ltd.", "commercial", ["NIMB"], bankLogoUrl("nepal-investment-mega-bank")),
  bank("sc.com", "Standard Chartered Bank Nepal Ltd.", "commercial", [], bankLogoUrl("standard-chartered-bank-nepal")),
  bank("himalayanbank.com", "Himalayan Bank Ltd.", "commercial", [], bankLogoUrl("himalayan-bank")),
  bank("nsbl.statebank", "Nepal SBI Bank Ltd.", "commercial", ["NSBL"], bankLogoUrl("nepal-sbi-bank")),
  bank("everestbankltd.com", "Everest Bank Ltd.", "commercial", [], bankLogoUrl("everest-bank")),
  bank("kumaribank.com", "Kumari Bank Ltd.", "commercial", [], bankLogoUrl("kumari-bank")),
  bank("laxmisunrise.com", "Laxmi Sunrise Bank Ltd.", "commercial", [], bankLogoUrl("laxmi-sunrise-bank")),
  bank("ctznbank.com", "Citizens Bank International Ltd.", "commercial", [], bankLogoUrl("citizens-bank-international")),
  bank("primebank.com.np", "Prime Commercial Bank Ltd.", "commercial", [], bankLogoUrl("prime-commercial-bank")),
  bank("sanimabank.com", "Sanima Bank Ltd.", "commercial", [], bankLogoUrl("sanima-bank")),
  bank("machbank.com", "Machhapuchhre Bank Ltd.", "commercial", ["MBL"], bankLogoUrl("machhapuchhre-bank")),
  bank("nicasiabank.com", "NIC Asia Bank Ltd.", "commercial", [], bankLogoUrl("nic-asia-bank")),
  bank("globalimebank.com", "Global IME Bank Ltd.", "commercial", [], bankLogoUrl("global-ime-bank")),
  bank("nmb.com.np", "NMB Bank Ltd.", "commercial", [], bankLogoUrl("nmb-bank")),
  bank("prabhubank.com", "Prabhu Bank Ltd.", "commercial", [], bankLogoUrl("prabhu-bank")),
  bank("siddharthabank.com", "Siddhartha Bank Ltd.", "commercial", [], bankLogoUrl("siddhartha-bank")),
  bank("rbb.com.np", "Rastriya Banijya Bank Ltd.", "commercial", ["RBB"], bankLogoUrl("rastriya-banijya-bank")),
]

export const NEPALI_DEVELOPMENT_BANKS: readonly NepaliBankOption[] = [
  bank("ndbl.com.np", "Narayani Development Bank Ltd.", "development", ["NDBL"], bankLogoUrl("narayani-development-bank")),
  bank("kdblnepal.com", "Karnali Development Bank Ltd.", "development", ["KRBL"], bankLogoUrl("karnali-development-bank")),
  bank("edb.com.np", "Excel Development Bank Ltd.", "development", ["EDBL"], bankLogoUrl("excel-development-bank")),
  bank("miteribank.com.np", "Miteri Development Bank Ltd.", "development", ["MDB"], bankLogoUrl("miteri-development-bank")),
  bank("muktinathbank.com.np", "Muktinath Bikas Bank Ltd.", "development", ["MNBBL"], bankLogoUrl("muktinath-bikas-bank")),
  bank("corporatebank.com.np", "Corporate Development Bank Ltd.", "development", ["CORBL"], bankLogoUrl("corporate-development-bank")),
  bank("sindhubank.com.np", "Sindhu Bikas Bank Ltd.", "development", ["SINDU"], bankLogoUrl("sindhu-bikas-bank")),
  bank("salapabikasbank.com.np", "Salapa Bikash Bank Ltd.", "development", ["SABBL"], bankLogoUrl("salapa-bikash-bank")),
  bank("greenbank.com.np", "Green Development Bank Ltd.", "development", ["GRDBL"], bankLogoUrl("green-development-bank")),
  bank("shangrilabank.com", "Sangrila Development Bank Ltd.", "development", ["SADBL", "Shangrila Development Bank Ltd."], bankLogoUrl("sangrila-development-bank")),
  bank("srdb.com.np", "Shine Resunga Development Bank Ltd.", "development", ["SHINE"], bankLogoUrl("shine-resunga-development-bank")),
  bank("jbbl.com.np", "Jyoti Bikas Bank Ltd.", "development", ["JBBL"], bankLogoUrl("jyoti-bikas-bank")),
  bank("garimabank.com.np", "Garima Bikas Bank Ltd.", "development", ["GBBL"], bankLogoUrl("garima-bikas-bank")),
  bank("mahalaxmibank.com", "Mahalaxmi Bikas Bank Ltd.", "development", ["MLBL"], bankLogoUrl("mahalaxmi-bikas-bank")),
  bank("lumbinibikasbank.com", "Lumbini Bikas Bank Ltd.", "development", ["LBBL"], bankLogoUrl("lumbini-bikas-bank")),
  bank("kamanasewabank.com", "Kamana Sewa Bikas Bank Ltd.", "development", ["KSBBL"], bankLogoUrl("kamana-sewa-bikas-bank")),
  bank("saptakoshidevelopmentbank.thulo.com.np", "Saptakoshi Development Bank Ltd.", "development", ["SAPTAKOSHI", "SAPDBL"], bankLogoUrl("saptakoshi-development-bank")),
]

export const NEPALI_BANKS: readonly NepaliBankOption[] = [
  ...NEPALI_COMMERCIAL_BANKS,
  ...NEPALI_DEVELOPMENT_BANKS,
]

function comparableBankName(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(ltd|limited)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
}

export function findNepaliBankByName(
  value: string | null | undefined,
  banks: readonly NepaliBankOption[] = NEPALI_BANKS,
): NepaliBankOption | null {
  const normalizedValue = comparableBankName(String(value ?? "").trim())

  if (!normalizedValue) {
    return null
  }

  for (const bankOption of banks) {
    if (comparableBankName(bankOption.name) === normalizedValue) {
      return bankOption
    }

    for (const alias of bankOption.aliases ?? []) {
      if (comparableBankName(alias) === normalizedValue) {
        return bankOption
      }
    }
  }

  return null
}
