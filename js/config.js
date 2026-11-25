/* Skinstencil configuration. Edit this file to change checkout; no other code changes are needed.
   Products live in Polar (organisation "Belline Technologies Limited"): Day pass, Pro monthly, Pro yearly, each with the
   "Skinstencil license key" benefit (day pass key expires after 1 day, 2 activations per key).
   Polar approved the account on 25 Nov 2026 (identity, payout and review all passed), so checkout is on.
   Leave a checkout value empty and the matching button shows "opens soon" instead of a broken link. */
window.SkinConfig = {
  polarOrgId: "9ef14326-9d33-47d5-b4b8-17d92fd67b47",
  checkout: {
    day: "https://buy.polar.sh/polar_cl_eYCpTIZMJdV1Hg8DtuQBDDustzUCEqY4JZ1za4SxBX7",
    month: "https://buy.polar.sh/polar_cl_M548UXCzOIvSF2ns2K3POQKIEerMIGVogcOmh0WygHc",
    year: "https://buy.polar.sh/polar_cl_RtlAFQ4fBXdVCVJiYUtHcVmwqlGmTetAxMO8p1IRBAX"
  },
  prices: { currency: "USD", day: "4.99", month: "12", year: "79" },
  analyticsToken: "87fa69765dd849aaa207fe3e48dfd3e8",
  notifyEmail: "hello@skinstencil.com",
  /* Address of the design-generator Worker (worker/README.md). Empty = the generator is not drawn on the page. */
  generatorUrl: "",
  freeMaxPx: 800,
  paidMaxPx: 4000
};
