/* Skinstencil configuration. Edit this file to switch checkout on; no other code changes are needed.
   How to switch checkout on (see PAYMENTS.md):
   1. In the payment provider (Polar), create three products: Day pass (24 hours), Pro monthly, Pro yearly. Attach a "license key" benefit to each.
      For the day pass set the license key to expire after 1 day.
   2. Paste each product's checkout link below, and your organization id into polarOrgId.
   Leave a value empty and the matching button shows "opens soon" instead of a broken link. */
window.SkinConfig = {
  polarOrgId: "",
  checkout: { day: "", month: "", year: "" },
  prices: { currency: "USD", day: "4.99", month: "12", year: "79" },
  notifyEmail: "hello@skinstencil.com",
  freeMaxPx: 1200,
  paidMaxPx: 4000
};
