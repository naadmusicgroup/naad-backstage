export const RELEASE_TYPES = ["single", "ep", "album"] as const
export type ReleaseType = (typeof RELEASE_TYPES)[number]

export const RELEASE_STATUSES = ["draft", "live", "taken_down", "deleted"] as const
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number]

export const ARTIST_RELEASE_SUBMISSION_STATUSES = ["pending_review", "approved", "rejected"] as const
export type ArtistReleaseSubmissionStatus = (typeof ARTIST_RELEASE_SUBMISSION_STATUSES)[number]

export type ReleaseDisplayStatus = ReleaseStatus | "pending_review" | "scheduled" | "rejected"

export const TRACK_STATUSES = ["draft", "live", "deleted"] as const
export type TrackStatus = (typeof TRACK_STATUSES)[number]

export const SPLIT_VERSION_SOURCES = ["migration", "admin", "artist_request"] as const
export type SplitVersionSource = (typeof SPLIT_VERSION_SOURCES)[number]

export const RELEASE_EVENT_TYPES = [
  "release_created",
  "release_edited",
  "genre_changed",
  "credits_changed",
  "split_version_created",
  "draft_edit_requested",
  "request_approved",
  "request_rejected",
  "request_applied",
  "takedown_requested",
  "takedown_completed",
  "release_deleted",
] as const
export type ReleaseEventType = (typeof RELEASE_EVENT_TYPES)[number]

export const RELEASE_CHANGE_REQUEST_TYPES = ["draft_edit", "takedown"] as const
export type ReleaseChangeRequestType = (typeof RELEASE_CHANGE_REQUEST_TYPES)[number]

export const RELEASE_CHANGE_REQUEST_STATUSES = ["pending", "approved", "rejected", "applied"] as const
export type ReleaseChangeRequestStatus = (typeof RELEASE_CHANGE_REQUEST_STATUSES)[number]

export const TRACK_CREDIT_ROLE_GROUPS = [
  {
    group: "Performance",
    roles: [
      "Main Artist",
      "Featured Artist",
      "Background Vocals",
      "Musician",
      "Soloist",
      "DJ",
    ],
  },
  {
    group: "Writing",
    roles: ["Composer", "Lyricist", "Songwriter", "Arranger"],
  },
  {
    group: "Production",
    roles: ["Producer", "Executive Producer", "Additional Producer", "Vocal Producer", "Programmer"],
  },
  {
    group: "Engineering",
    roles: ["Recording Engineer", "Mix Engineer", "Mastering Engineer", "Assistant Engineer"],
  },
  {
    group: "Instrumentalists",
    roles: [
      "Guitar",
      "Bass",
      "Drums",
      "Percussion",
      "Piano",
      "Keyboards",
      "Synthesizer",
      "Violin",
      "Viola",
      "Cello",
      "Brass",
      "Woodwind",
    ],
  },
  {
    group: "Creative",
    roles: ["Creative Director", "Artwork/Design", "Photographer"],
  },
  {
    group: "Business",
    roles: ["A&R", "Manager", "Project Manager"],
  },
] as const

export const TRACK_CREDIT_ROLE_OPTIONS = TRACK_CREDIT_ROLE_GROUPS.flatMap((group) => [...group.roles]) as string[]

export const TRACK_WRITER_CREDIT_ROLE_GROUPS = [
  {
    group: "Writer Roles",
    roles: ["Lyricist", "Composer", "Songwriter", "Arranger"],
  },
] as const

export const TRACK_ARTIST_CREDIT_ROLE_GROUPS = [
  {
    group: "Artist Roles",
    roles: ["Main Artist", "Featured Artist", "Remixer"],
  },
] as const

const ADDITIONAL_TRACK_CREDIT_ROLE_TEXT = `
Publishing Company
Producer
Album Art Direction
Executive Producer
Recording Studio
Guitarist
Percussion
Bass Guitarist
Mixing Engineer
Sound Design
Marketing & PR
Manager
Graphic Designer
Mastering Engineer
Additional Instrumentation
Beat Maker
Saxophonist
Additional Vocals
Background Vocals
Pianist
Recording Engineer
Photographer
Studio Assistant
Legal Team
Performance Rights Organization
Inspired By
Production Company
Special Thanks
10-String Bass Guitar
10-String Guitar
11-String Guitar
12-String Acoustic Guitar
12-String Bass Guitar
12-String Electric Guitar
12-String Fiddle
12-String Guitar
4-String Banjo
4-String Guitar
5-String Banjo
5-String Bass Guitar
6-String Banjo
6-String Bass Guitar
7-String Banjo
7-String Bass Guitar
7-String Guitar
8-String Bass Guitar
8-String Guitar
9-String Guitar
A Cappella Ensemble
Accompaniment
Accordion
Accordion Duo
Acoustic Baritone Guitar
Acoustic Bass Guitar
Acoustic Fretless Guitar
Acoustic Guitar
Acoustic Rhythm Guitar
Acoustic Slide Guitar
Actor
African Percussion
All Instruments
Alphorn
Alto (Vocal)
Alto Clarinet
Alto Flute
Alto Guitar
Alto Horn
Alto Lute
Alto Recorder
Alto Saxophone
Alto Tenor (Vocal)
Alto Trombone
Alto Viol
Alto Viola
Alto Viola da Gamba
Alto Violin
Alto Zither
Announcer
Appalachian Dulcimer
Archlute
Army Band
ARP Synthesizer
Assistant Conductor
Assistant Director
Assistant Programming
Associate Conductor
Audio Source Artist
Autoharp
B-Flat Clarinet
Baby Bass
Baglama
Bagpipes
Bajo Quinto
Bajo Sexto
Balafon
Balalaika
Ballet Orchestra
Bamboo Flute
Bamboo Saxophone
Band
Band Conductor
Band Leader
Bandola
Bandoneon
Bandura
Bandurria
Banjo
Banjolin
Bansuri
Barbat
Baritone (Vocal)
Baritone Guitar
Baritone Horn
Baritone Saxophone
Baritone Trombone
Baritone Violin
Baroque Alto Trombone
Baroque Bass Trombone
Baroque Bassoon
Baroque Bassoon Ensemble
Baroque Brass Ensemble
Baroque Cello
Baroque Chamber Orchestra
Baroque Choir
Baroque Flute
Baroque Guitar
Baroque Harp
Baroque Lute
Baroque Music Ensemble
Baroque Music String Ensemble
Baroque Music Vocal Ensemble
Baroque Music Wind Ensemble
Baroque Oboe
Baroque Opera Orchestra
Baroque Orchestra
Baroque Quartet
Baroque Recorder
Baroque Trio
Baroque Trumpet
Baroque Viola
Baroque Violin
Baroque Wind Ensemble
Barrel Organ
Baryton
Bass
Bass (Vocal)
Bass Banjo
Bass Clarinet
Bass Drum
Bass Flute
Bass Flute-A-Bec
Bass Guitar
Bass Harmonica
Bass Harp
Bass Horn
Bass Lute
Bass Marimba
Bass Oboe
Bass Recorder
Bass Saxophone
Bass Synthesizer
Bass Trombone
Bass Trumpet
Bass Viola Da Gamba
Bass Violin
Bass-Baritone (Vocal)
Basset Clarinet
Basset Horn
Basset Recorder
Basso Continuo
Bassoon
Bassoon Quartet
Batá Drums
Bayan
Beatbox
Beats
Bells
Bendir
Berimbau
Birbyne
Biwa
Bodhrán Drum
Bongos
Bouzouki
Boy Soprano (Vocal)
Boys' Choir
Brass
Brass and Organ Ensemble
Brass Band
Brass Conductor
Brass Ensemble
Brass Instrument
Brass Octet
Brass Orchestra
Brass Quartet
Brass Quintet
Brass Septet
Bugle
Bukkehorn
Button Accordion
Byzantine Lyra
C-Melody Saxophone
Cabasa
Cajon
Cajun Fiddle
Cantor
Carillon
Cast
Castanets
Cathedral Choir
Cavaquinho
Caxixi
Celesta
Cello
Cello Duo
Cello Octet
Cello Quartet
Celtic Flute
Celtic Harp
Chalumeau
Chamber Choir
Chamber Music Ensemble
Chamber Orchestra
Chamber Organ
Chamberlain Strings
Chant Conductor
Chant Vocals
Chapman Stick
Charango
Children's Choir
Children's Vocals
Chimes
Chinese Flute
Chinese Traditional Music Ensemble
Chitarrone
Choir
Choir Boy
Choir Conductor
Choir Director
Choral Conductor
Chorus
Chorus Conductor
Chorus Director
Christmas Carols Ensemble
Chromatic Harmonica
Cimbalom
Cittern
Clap Stick
Claps
Clarinet
Clarinet Orchestra
Clarinet Quartet
Clarinet Trio
Classical Ensemble
Classical Guitar
Classical Vocals
Claves
Clavichord
Clavier
Clavinet
Comedian
Commentary
Concertina
Conductor
Congas
Contemporary Music Chamber Orchestra
Contemporary Music Ensemble
Contemporary Music Orchestra
Contemporary Music Quartet
Contemporary Music Trio
Continuo
Contrabass
Contrabass Clarinet
Contrabass Flute
Contrabass Recorder
Contrabass Saxophone
Contrabass Trombone
Contrabassoon
Contralto (Vocal)
Contralto Clarinet
Cornet
Cornetto
Corno da Caccia
Coro
Counter-Tenor (Vocal)
Cowbell
Crossover Duo
Crossover Ensemble
Crossover Trio
Crotales
Crumhorn
Cuatro
Cuatro Venezolano
Cuica
Cymbals
Daf
Đàn Tranh
Dancer
Darbuka
Daxophone
Dhol
Dialogue
Didgeridoo
Dilruba
Dizi
DJ
Djembe
Dobro
Dojo
Domra
Double Bass
Double Bass Ensemble
Double Bass Quartet
Double Flute
Double Recorder
Doumbek
Drum Machine
Drums
Duduk
Duet Vocals
Dulcian
Dulcimer
Dutar
E-Bow
Early Music Chamber Choir
Early Music Chamber Orchestra
Early Music Choir
Early Music Duo
Early Music Ensemble
Early Music Instrument
Early Music Orchestra
Early Music Trio
Early Music Vocal Ensemble
Electric Banjo
Electric Bass Guitar
Electric Cello
Electric Fretless Guitar
Electric Guitar
Electric Mandolin
Electric Piano
Electric Sitar
Electric Upright Bass
Electric Violin
Electronic Instrument
Electronic Music Ensemble
Electronic Percussion
Electronics
English Horn
Ensemble
Ensemble Director
Ensemble Role
Erhu
Euphonium
EWI
Fairlight CMI
Farfisa
Fiddle
Fife
Finger Cymbals
Finger Snaps
First Cello
First Violin
Flageolet
Flamenco Cajón
Flamenco Guitar
Flugelhorn
Flute
Flute Ensemble
Flute Quartet
Flute Quintet
Folk Music Ensemble
Folk Music Orchestra
Foot Stomping
Fortepiano
Frame Drum
French Horn
Fretless Bass Guitar
Fretless Guitar
Fujara
Funde
Fuzz Guitar
Gadulka
Gamelan
Gang Vocals
Ghatam
Girls' Choir
Gittern
Glass Harmonica
Glockenspiel
Gong
Gospel Choir
Gothic Harp
Great Bass Recorder
Gregorian Chant Choir
Gregorian Chant Ensemble
Group
Güícharo
Güira
Güiro
Guitar
Guitar Duo
Guitar Quartet
Guitar Synthesizer
Guitar Trio
Guitarron
Gut String Guitar
Haegeum
Hammered Dulcimer
Hammond Organ
Hand Claps
Handbell Choir
Hang
Hardanger Fiddle
Harmonica
Harmonium
Harmony Vocals
Harp
Harp Ensemble
Harpsichord
Haute Contre Vocals
Hawaiian Guitar
Heckelphone
Herald Trumpet
Hi-Hat
Hi-String Guitar
Hichiriki
High Tenor (Vocal)
Historical Bassoon
Historical Guitar
Historical Harp
Horn
Horn Conductor
Horn Ensemble
Horn Quartet
Horn Section
Host
Hurdy Gurdy
Indian Flute
Instrument
Instrumental Ensemble
Interviewee
Interviewer
Intro Vocals
Introduction by
Irish Flute
Irish Whistle
Japanese Flute
Jaw Harp
Kalimba
Kamancheh
Kantele
Kanun
Kaval
Kazoo
Keyboard Bass
Keyboard Instrument
Keyboard Synth
Keyboards
Keytar
Khene
Kora
Koto
Kugo
Lap Cello
Lap Slide Guitar
Lap Steel Guitar
Lautenwerck
Lead Acoustic Guitar
Lead Electric Guitar
Lead Guitar
Lead Violin
Lead Vocals
Leader
Leaf
Lirone
Loops
Low Whistle
Lowrey Organ
Lute
Lute Duo
Lyra Viol
Lyre
Lyricon
Mandocello
Mandola
Mandolin
Maracas
Marching Band
Marimba
Mbira
MC
Medieval Flute
Medieval Harp
Medieval Music Ensemble
Medieval Music Quartet
Medieval Music Vocal Ensemble
Mellophone
Mellotron
Melodeon
Melodica
Men's Choir
Metallophone
Mezzo Violin
Mezzo-Soprano (Vocal)
Military Band
Military Choir
Mixed Artist
Modular Synth
Mong
Moog
Mouth Organ
Mridangam
Musette
Music Director
Musical Saw
Musician
Muted Trombone
Muted Trumpet
Narrator
Native American Flute
Natural Horn
Ney
Nyckelharpa
Nylon-String Guitar
Oboe
Oboe d'Amore
Oboe Da Caccia
Ocarina
Omnichord
Ondes Martenot
Opera and Ballet Orchestra
Opera Choir
Opera Company
Opera Orchestra
Ophicleide
Orchestra
Orchestra Conductor
Orchestra Director
Orchestra Leader
Orchestra Manager
Organ
Organ Pedals
Organetto
Other Brass Instrument
Other Instrument
Other Keyboard Instrument
Other Percussion Instrument
Other Performer
Other String Instrument
Other Wind Instrument
Other Woodwind Instrument
Oud
Paetzold Contrabass Recorder
Pakhavaj
Palmas
Pan Flute
Pandeiro
Panderos
Panpipes
Pardessus de Viole
Parlor Guitar
Pedal Steel Guitar
Penny Whistle
Percussion Duo
Percussion Ensemble
Percussion Instrument
Percussion Quartet
Performer
Period Instrument Orchestra
Philharmonic Choir
Philharmonic Orchestra
Piano
Piano Duo
Piano Quartet
Piano Quintet
Piano Trio
Piccolo Bass
Piccolo Flute
Piccolo Trumpet
Pierrot Ensemble
Pipa
Pipe
Pipe Ensemble
Pipe Organ
Pipes
Playback Singer
Pocket Trumpet
Pops Orchestra
Portuguese Guitar
Positive Organ
Post Horn
Prepared Piano
Primera Voz
Principal
Programming
Psaltery
Pump Organ
Radio Choir
Radio Orchestra
Ragga MC
Rap
Realization (figured bass)
Rebab
Rebec
Recorder
Recorder Ensemble
Recorder Quartet
Recorder Quintet
Reed Organ
Reeds
Renaissance Flute
Renaissance Guitar
Renaissance Music Chamber Choir
Renaissance Music Ensemble
Renaissance Music Quartet
Renaissance Music Wind Ensemble
Repeater Drum
Requinto Guitar
Requinto Jarocho
Resonator Guitar
Rhodes Piano
Rhythm Guitar
Romantic Guitar
Romantic Music Ensemble
Russian Folk Music Ensemble
Russian Guitar
Sabar Ensemble
Sackbut
Sacred Music Choir
Sacred Music Ensemble
Sampled Artist
Sampler
Santur
Sarangi
Sarod
Saxello
Saxophone
Saxophone Quartet
Saxophone Quintet
Scratches
Screams
Second Cello
Second Violin
Second Vocals
Segunda Voz
Serpent
Shaker
Shakuhachi
Shawm
Shehnai
Shekere
Sheng
Shō
Shouts
Sistrum
Sitar
Sleigh Bells
Slide Guitar
Slide Trumpet
Slide Whistle
Snare Drum
Solo
Sopilka
Sopranino Recorder
Sopranino Saxophone
Soprano (Vocal)
Soprano Clarinet
Soprano Cornet
Soprano Flute
Soprano Recorder
Soprano Saxophone
Soprano Trombone
Soprano Viola da Gamba
Soprano Violin
Sound Effects
Sousaphone
Speaker
Spinet
Spoken Word
Spoons
Steel Drum
Steel Guitar
Streichmelodion
String Conductor
String Ensemble
String Instrument
String Octet
String Orchestra
String Quartet
String Quintet
String Section
String Sextet
String Trio
Strings
Stritch
Stroh Violin
Studio Choir
Studio Orchestra
Stylophone
Surbahar
Surdo
Swing Music Band
Symphonic Band
Symphony Choir
Symphony Chorus
Symphony Orchestra
Synclavier
Synth Bass
Synth Guitar
Synth Pads
Synth Percussion
Synth Strings
Synthesizer
Synthesizer Programming
Tabla
Tabor
Tafelklavier
Taiko Drums
Talkbox
Talking Drum
Tamborim
Tamboura
Tambourine
Tanbur
Tango Ensemble
Tanpura
Taonga Pūoro
Tap Dancer
Tape
Tar
Temple Blocks
Tenor (Vocal)
Tenor Banjo
Tenor Drums
Tenor Guitar
Tenor Horn
Tenor Recorder
Tenor Sackbut
Tenor Saxophone
Tenor Trombone
Tenor Viol
Tenor Viola da Gamba
Tenor Violin
Theorbo
Theremin
Tibetan Bowls
Timbales
Timpani
Tin Whistle
Toasting
Tom-Toms
Toy Piano
Transverse Flute
Trautonium
Traverso
Treble (Vocal)
Treble Recorder
Treble Viol
Treble Viola da Gamba
Treble Violin
Tres
Triangle
Trombone
Trombone Quartet
Trumpet
Trumpet Duo
Trumpet Ensemble
Tuba
Tuba Ensemble
Tubular Bells
Turntables
Txistu
Udu
Uilleann Pipes
Ukulele
Upright Bass
Upright Piano
Valve Trombone
Veena
Vibes
Vibraphone
Vibraslap
Vielle
Vihuela
Viol
Viol Consort
Viola
Viola d'Amore
Viola da Gamba
Viola da Gamba Ensemble
Viola Quartet
Violetta
Violin
Violin Duo
Violin Ensemble
Violoncello
Violone
Violone Grosso
Virginal
Vocal Conductor
Vocal Director
Vocal Duo
Vocal Effects
Vocal Ensemble
Vocal Quartet
Vocal Trio
Vocaloid
Vocals
Vocoder
Washboard
Whistle
Whistling
Wind Chimes
Wind Ensemble
Wind Instrument
Wind Octet
Wind Orchestra
Wind Quartet
Wind Quintet
Wind Trio
Women's Choir
Wood Block
Wood Flute
Wood Recorder
Wood Whistle
Woodwind Ensemble
Woodwind Instrument
Woodwind Quintet
Woodwinds
Worship Leader
Wurlitzer Piano
Xylophone
Xylorimba
Youth Choir
Youth Orchestra
Zarb
Zither
`

export const TRACK_ADDITIONAL_CREDIT_ROLE_OPTIONS = [
  ...new Set(ADDITIONAL_TRACK_CREDIT_ROLE_TEXT.trim().split(/\r?\n/).map((role) => role.trim()).filter(Boolean)),
]

export const TRACK_ADDITIONAL_CREDIT_ROLE_GROUPS = [
  {
    group: "Additional Credits",
    roles: TRACK_ADDITIONAL_CREDIT_ROLE_OPTIONS,
  },
]

export function normalizeTrackCreditRoleCodes(roleCodes: string[], roleOptions: readonly string[] = TRACK_CREDIT_ROLE_OPTIONS) {
  return [...new Set(roleCodes.filter(Boolean))].sort((left, right) => {
    const leftIndex = roleOptions.indexOf(left)
    const rightIndex = roleOptions.indexOf(right)

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right)
    }

    if (leftIndex === -1) {
      return 1
    }

    if (rightIndex === -1) {
      return -1
    }

    return leftIndex - rightIndex
  })
}

export const RELEASE_GENRE_OPTIONS = [
  "Alternative",
  "Classical",
  "Country",
  "Dance",
  "Electronic",
  "Folk",
  "Gospel",
  "Hip-Hop",
  "Indie",
  "Jazz",
  "Latin",
  "Metal",
  "Pop",
  "R&B",
  "Reggae",
  "Rock",
  "Soul",
  "Soundtrack",
  "World",
  "Other",
] as const

export const RELEASE_STORE_OPTIONS = [
  "Spotify",
  "Apple Music",
  "YouTube Music",
  "TikTok",
  "Instagram / Facebook",
  "Amazon Music",
  "Deezer",
  "Tidal",
  "Pandora",
  "SoundCloud",
  "JioSaavn",
  "Boomplay",
] as const

export type CollaboratorInputValue = number | string
export type CatalogImportIssueCode =
  | "missing_release_title"
  | "missing_track_title"
  | "missing_isrc"
  | "invalid_release_date"
  | "release_exists_other_artist"
  | "track_exists_other_release"
  | "track_exists_other_artist"
  | "duplicate_track_in_file"

export interface TrackCreditInput {
  creditedName: string
  linkedArtistId?: string | null
  roleCode: string
  instrument?: string | null
  displayCredit?: string | null
  notes?: string | null
  sortOrder?: number | string | null
}

export interface AdminTrackCreditRecord {
  id: string
  trackId: string
  creditedName: string
  linkedArtistId: string | null
  linkedArtistName: string | null
  roleCode: string
  instrument: string | null
  displayCredit: string | null
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ArtistReleaseSubmissionTrackRecord {
  id: string
  submissionId: string
  trackId: string
  sourceAudioUrl: string
  finalAudioUrl: string | null
  sourceFilename: string | null
  createdAt: string
  updatedAt: string
}

export interface ArtistReleaseSubmissionRecord {
  id: string
  releaseId: string
  artistId: string
  artistName: string | null
  submittedByProfileId: string
  submittedByName: string | null
  status: ArtistReleaseSubmissionStatus
  sourceCoverArtUrl: string
  finalCoverArtUrl: string | null
  targetStores: string[]
  artistNotes: string | null
  adminNotes: string | null
  reviewedByProfileId: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  tracks: ArtistReleaseSubmissionTrackRecord[]
  createdAt: string
  updatedAt: string
}

export interface SplitVersionContributorRecord {
  artistId: string
  artistName: string
  role: string
  splitPct: number
}

export interface AdminReleaseSplitVersionRecord {
  id: string
  releaseId: string
  effectivePeriodMonth: string
  changeReason: string | null
  source: SplitVersionSource
  createdByProfileId: string | null
  createdAt: string
  contributors: SplitVersionContributorRecord[]
}

export interface AdminTrackSplitVersionRecord {
  id: string
  trackId: string
  releaseId: string
  effectivePeriodMonth: string
  changeReason: string | null
  source: SplitVersionSource
  createdByProfileId: string | null
  createdAt: string
  contributors: SplitVersionContributorRecord[]
}

export interface AdminReleaseEventRecord {
  id: string
  releaseId: string
  eventType: ReleaseEventType
  actorRole: "system" | "admin" | "artist"
  actorProfileId: string | null
  actorArtistId: string | null
  actorName: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export interface ReleaseChangeRequestSnapshot {
  release: Record<string, unknown>
  tracks: Record<string, unknown>[]
  credits: Record<string, unknown>[]
  genre: string | null
}

export interface AdminReleaseChangeRequestRecord {
  id: string
  releaseId: string
  requesterArtistId: string
  requesterArtistName: string
  requestedByProfileId: string
  requestedByName: string | null
  requestType: ReleaseChangeRequestType
  status: ReleaseChangeRequestStatus
  snapshot: ReleaseChangeRequestSnapshot
  takedownReason: string | null
  proofUrls: string[]
  adminNotes: string | null
  reviewedByProfileId: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  appliedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminReleaseCollaboratorRecord {
  id: string
  releaseId: string
  artistId: string
  artistName: string
  role: string
  splitPct: number
  createdAt: string
  updatedAt: string
}

export interface AdminTrackCollaboratorRecord {
  id: string
  trackId: string
  releaseId: string
  trackTitle: string
  artistId: string
  artistName: string
  role: string
  splitPct: number
  createdAt: string
  updatedAt: string
}

export interface AdminTrackRecord {
  id: string
  artistId: string
  releaseId: string
  releaseTitle: string
  title: string
  isrc: string
  trackNumber: number | null
  durationSeconds: number | null
  audioPreviewUrl: string | null
  lyrics: string | null
  tiktokPreviewStartSeconds: number | null
  versionLine: string | null
  containsAiGeneratedElements: boolean
  sourceAudioUrl: string | null
  finalAudioUrl: string | null
  status: TrackStatus
  credits: AdminTrackCreditRecord[]
  collaborators: AdminTrackCollaboratorRecord[]
  splitHistory: AdminTrackSplitVersionRecord[]
  createdAt: string
  updatedAt: string
}

export interface AdminReleaseRecord {
  id: string
  artistId: string
  artistName: string | null
  title: string
  type: ReleaseType
  genre: string
  upc: string | null
  coverArtUrl: string | null
  sourceCoverArtUrl: string | null
  coverStoragePath: string | null
  coverThumbUrl: string | null
  coverThumbStoragePath: string | null
  streamingLink: string | null
  releaseDate: string | null
  status: ReleaseStatus
  displayStatus: ReleaseDisplayStatus
  submission: ArtistReleaseSubmissionRecord | null
  takedownReason: string | null
  takedownProofUrls: string[]
  takedownRequestedAt: string | null
  takedownCompletedAt: string | null
  tracks: AdminTrackRecord[]
  collaborators: AdminReleaseCollaboratorRecord[]
  splitHistory: AdminReleaseSplitVersionRecord[]
  events: AdminReleaseEventRecord[]
  currentRequest: AdminReleaseChangeRequestRecord | null
  createdAt: string
  updatedAt: string
}

export interface CreateTrackInput {
  releaseId: string
  title: string
  isrc: string
  trackNumber: number | string | null
  audioPreviewUrl: string | null
  lyrics?: string | null
  tiktokPreviewStartSeconds?: number | string | null
  versionLine?: string | null
  containsAiGeneratedElements?: boolean | null
  status: TrackStatus
  credits?: TrackCreditInput[]
}

export interface UpdateTrackInput {
  releaseId?: string
  title?: string
  isrc?: string
  trackNumber?: number | string | null
  audioPreviewUrl?: string | null
  lyrics?: string | null
  tiktokPreviewStartSeconds?: number | string | null
  versionLine?: string | null
  containsAiGeneratedElements?: boolean | null
  status?: TrackStatus
}

export interface CreateReleaseInput {
  artistId: string
  title: string
  type: ReleaseType
  genre: string
  upc: string | null
  coverArtUrl: string | null
  streamingLink: string | null
  releaseDate: string | null
  status: ReleaseStatus
  tracks?: CreateTrackInput[]
}

export interface UpdateReleaseInput {
  artistId?: string
  title?: string
  type?: ReleaseType
  genre?: string
  upc?: string | null
  coverArtUrl?: string | null
  streamingLink?: string | null
  releaseDate?: string | null
  status?: ReleaseStatus
}

export interface CreateReleaseCollaboratorInput {
  releaseId: string
  artistId: string
  role: string
  splitPct: CollaboratorInputValue
  effectivePeriodMonth: string
  changeReason?: string | null
}

export interface UpdateReleaseCollaboratorInput {
  artistId?: string
  role?: string
  splitPct?: CollaboratorInputValue
  effectivePeriodMonth?: string
  changeReason?: string | null
}

export interface CreateTrackCollaboratorInput {
  trackId: string
  artistId: string
  role: string
  splitPct: CollaboratorInputValue
  effectivePeriodMonth: string
  changeReason?: string | null
}

export interface UpdateTrackCollaboratorInput {
  artistId?: string
  role?: string
  splitPct?: CollaboratorInputValue
  effectivePeriodMonth?: string
  changeReason?: string | null
}

export interface ReplaceTrackCreditsInput {
  credits: TrackCreditInput[]
}

export interface CreateReleaseChangeRequestInput {
  releaseId: string
  requestType: ReleaseChangeRequestType
  snapshot?: ReleaseChangeRequestSnapshot
  takedownReason?: string | null
  proofUrls?: string[]
}

export interface ReviewReleaseChangeRequestInput {
  adminNotes?: string | null
}

export interface ReleaseTakedownInput {
  reason: string
  proofUrls?: string[]
  resolutionNotes?: string | null
}

export interface BulkCatalogImportInput {
  artistId: string
  filename: string
  csvText: string
}

export interface CatalogImportIssue {
  scope: "release" | "track" | "row"
  code: CatalogImportIssueCode
  message: string
  releaseTitle: string | null
  trackTitle: string | null
  isrc: string | null
  upc: string | null
}

export interface BulkCatalogImportResponse {
  filename: string
  parsedReleaseCount: number
  parsedTrackCount: number
  createdReleaseCount: number
  reusedReleaseCount: number
  createdTrackCount: number
  skippedTrackCount: number
  issues: CatalogImportIssue[]
}

export interface PagedWorkspaceMeta {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export interface AdminReleaseWorkspaceResponse {
  releases: AdminReleaseRecord[]
  pendingRequests: AdminReleaseChangeRequestRecord[]
  pagination: PagedWorkspaceMeta
}
