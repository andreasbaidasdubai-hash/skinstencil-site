/* Skinstencil configuration. Edit this file to change checkout; no other code changes are needed.
   Products live in Polar (organisation "Belline Technologies Limited"): Day pass ("Skinstencil license key", expires after 1 day),
   7-day pass ("Skinstencil 7-day key", expires after 7 days), Pro monthly and Pro yearly ("Skinstencil Pro key", never expires).
   Every key has 2 activations.
   Polar approved the account on 25 Nov 2026 (identity, payout and review all passed), so checkout is on.
   Leave a checkout value empty and the matching button shows "opens soon" instead of a broken link. */
window.SkinConfig = {
  polarOrgId: "9ef14326-9d33-47d5-b4b8-17d92fd67b47",
  checkout: {
    day: "https://buy.polar.sh/polar_cl_eYCpTIZMJdV1Hg8DtuQBDDustzUCEqY4JZ1za4SxBX7",
    month: "https://buy.polar.sh/polar_cl_M548UXCzOIvSF2ns2K3POQKIEerMIGVogcOmh0WygHc",
    year: "https://buy.polar.sh/polar_cl_RtlAFQ4fBXdVCVJiYUtHcVmwqlGmTetAxMO8p1IRBAX",
    /* 7-day pass: its own Polar benefit, so the key expires after 7 days (the day pass benefit expires after 1 day, the Pro benefit never). */
    week: "https://buy.polar.sh/polar_cl_4BHJ61UvPuR9C4GupmnvGSvqIbK9ubWNP2bqL3sZYMd"
  },
  prices: { currency: "USD", day: "7.99", week: "14.99", month: "19", year: "149" },
  analyticsToken: "87fa69765dd849aaa207fe3e48dfd3e8",
  notifyEmail: "hello@skinstencil.com",
  /* Address of the design-generator Worker (worker/README.md). Empty = the generator is not drawn on the page. */
  generatorUrl: "https://skinstencil-generate.skinstencil.workers.dev",
  /* Public site key of the Cloudflare Turnstile widget (the bot check on the generator). Empty = no check on the page; the Worker enforces it as soon as its TURNSTILE_SECRET is set. */
  turnstileSiteKey: "0x4AAAAAAGSh3lEjLDxjJiQ0",
  freeMaxPx: 800,
  paidMaxPx: 4000
};
