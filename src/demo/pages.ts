/** Page text for the three demo page monitors. Each entry is one stored snapshot, oldest first. */
export interface DemoPageVersion {
  at: string;
  content: string;
}

const ledgerly = (o: { quote: string; faq: string; studios: string; soc: boolean; priced: boolean }) =>
  [
    "# Ledgerly pricing",
    "Invoicing and payments for creative teams.",
    `Trusted by ${o.studios} studios in 31 countries.`,
    "## Plans",
    o.priced ? "Studio: $35 /mo" : "Studio: $29 /mo",
    "For solo designers and studios of up to five people.",
    o.priced ? "Up to 25 active clients on Studio" : "Unlimited clients on every plan",
    "Recurring invoices and payment reminders",
    "Card and bank transfer payments",
    o.priced ? "Team: $89 /mo" : "Team: $79 /mo",
    "For studios that bill by project and by retainer.",
    "Everything in Studio",
    "Time tracking with approval",
    "Multi-currency invoices",
    ...(o.priced ? ["Unlimited active clients", "Client portal add-on: $9 /mo per workspace"] : []),
    "Enterprise: talk to us",
    "Single sign-on, audit log and a named account manager.",
    "## What customers say",
    o.quote,
    "## Questions",
    "Can I change plans later?",
    "Yes. Changes apply from your next invoice.",
    "Do you charge payment fees?",
    o.faq,
    "Is there a free trial?",
    "Every plan starts with 14 days free. No card needed.",
    ...(o.soc ? ["SOC 2 Type II report available on request."] : []),
    o.priced ? "Prices in USD. Billed monthly, or yearly with two months free." : "Prices in USD. Billed monthly or yearly.",
    "Ledgerly Inc., 2026",
  ].join("\n");

const Q1 = '"We send forty invoices a month and chase none of them." Rosalind Achterberg, Field & Fathom';
const Q2 = '"Month end used to take a week. Now it takes an afternoon." Ikaika Morrow, Saltbox Studio';
const F1 = "We pass on the processor fee with no markup.";
const F2 = "We pass on the card processor fee with no markup. Bank transfers are free.";

export const LEDGERLY_PRICING: DemoPageVersion[] = [
  { at: "2026-09-09T00:00:00Z", content: ledgerly({ quote: Q1, faq: F1, studios: "4,200", soc: false, priced: false }) },
  { at: "2026-09-14T10:00:00Z", content: ledgerly({ quote: Q2, faq: F1, studios: "4,200", soc: false, priced: false }) },
  { at: "2026-09-19T16:00:00Z", content: ledgerly({ quote: Q2, faq: F2, studios: "4,200", soc: false, priced: false }) },
  { at: "2026-09-24T09:00:00Z", content: ledgerly({ quote: Q2, faq: F2, studios: "4,600", soc: false, priced: false }) },
  { at: "2026-09-30T11:00:00Z", content: ledgerly({ quote: Q2, faq: F2, studios: "4,600", soc: true, priced: false }) },
  { at: "2026-10-07T14:00:00Z", content: ledgerly({ quote: Q2, faq: F2, studios: "4,600", soc: true, priced: true }) },
];

const paperkite = (o: { solo: string; trial: string }) =>
  [
    "# Paperkite plans",
    "Proposals, contracts and invoices in one place.",
    `Solo: ${o.solo} /mo`,
    "One seat, unlimited proposals, five active projects.",
    "Studio: $49 /mo",
    "Five seats, unlimited projects, branded client portal.",
    "Agency: $129 /mo",
    "Twenty seats, approval flows, priority support.",
    "## Included in every plan",
    "E-signatures",
    "Invoice templates",
    "Stripe and GoCardless payments",
    "Email support in English, French and German",
    "## Trial",
    `${o.trial} free trial on every plan.`,
    "Cancel any time from the billing page.",
    "## Compare",
    "See how Paperkite compares with Tallyroom, Ledgerly and Invoxa.",
    "Paperkite GmbH, Berlin",
  ].join("\n");

export const PAPERKITE_PRICING: DemoPageVersion[] = [
  { at: "2026-09-09T05:00:00Z", content: paperkite({ solo: "$24", trial: "14-day" }) },
  { at: "2026-09-18T05:00:00Z", content: paperkite({ solo: "$19", trial: "14-day" }) },
  { at: "2026-09-29T05:00:00Z", content: paperkite({ solo: "$19", trial: "21-day" }) },
];

const INVOXA_BASE = [
  "# Invoxa changelog",
  "What we shipped, newest first.",
  "## September 4: Faster PDF export",
  "Invoices with more than 200 lines now export in under two seconds.",
  "## August 28: Dutch and Portuguese",
  "The app and every invoice template are available in two more languages.",
  "## August 19: Retainer rollover",
  "Unused retainer hours can roll into the next month, with a limit you set.",
  "## August 11: Receipts by email",
  "Forward a receipt to your workspace address and it lands on the right project.",
  "## July 30: Late fee rules",
  "Set a flat or percentage late fee per client.",
  "## July 22: New dashboard",
  "Outstanding, overdue and paid totals on one screen.",
  "## July 9: Xero sync",
  "Two-way sync of invoices, contacts and payments.",
  "## June 26: Credit notes",
  "Issue a full or partial credit note from any paid invoice.",
  "## June 12: Client contacts",
  "Add more than one billing contact per client.",
  "Subscribe to updates by email or RSS.",
  "Invoxa Ltd, Dublin",
];

const INVOXA_ENTRIES: { at: string; lines: string[] }[] = [
  { at: "2026-09-11T12:00:00Z", lines: ["## September 11: Purchase order numbers", "Add a PO number to any invoice and search by it."] },
  { at: "2026-09-13T18:00:00Z", lines: ["## September 13: Keyboard shortcuts", "Press ? anywhere to see the list."] },
  { at: "2026-09-16T06:00:00Z", lines: ["## September 16: Bulk reminders", "Select overdue invoices and send every reminder in one step."] },
  { at: "2026-09-18T12:00:00Z", lines: ["## September 18: Estimates to invoices", "Turn an accepted estimate into a draft invoice."] },
  { at: "2026-09-21T00:00:00Z", lines: ["## September 21: Swiss QR bills", "Invoices in CHF can carry a QR bill slip."] },
  { at: "2026-09-24T18:00:00Z", lines: ["## September 24: Project budgets", "Set a budget per project and see what is left."] },
  { at: "2026-09-26T12:00:00Z", lines: ["## September 26: CSV import for clients", "Bring your client list in from a spreadsheet."] },
  { at: "2026-09-29T06:00:00Z", lines: ["## September 29: Dark invoices", "A dark template for studios that want one."] },
  {
    at: "2026-10-03T12:00:00Z",
    lines: [
      "## October 3: Stripe Tax support for EU invoices",
      "Invoxa now works out VAT for every EU member state through Stripe Tax.",
      "Reverse charge wording is added for business customers with a valid VAT number.",
      "One Stop Shop reports export as CSV, per quarter.",
      "Tax is shown per line and in the invoice total.",
      "Existing invoices are not changed.",
      "Turn it on under Settings, Taxes.",
      "Available on the Team and Agency plans.",
      "Read the guide for the full list of supported countries.",
    ],
  },
  { at: "2026-10-06T06:00:00Z", lines: ["## October 6: Invoice numbering per client", "Give each client its own number sequence."] },
];

export const INVOXA_CHANGELOG: DemoPageVersion[] = (() => {
  const out: DemoPageVersion[] = [{ at: "2026-09-09T00:00:00Z", content: INVOXA_BASE.join("\n") }];
  let lines = INVOXA_BASE;
  for (const e of INVOXA_ENTRIES) {
    lines = [...lines.slice(0, 2), ...e.lines, ...lines.slice(2)];
    out.push({ at: e.at, content: lines.join("\n") });
  }
  return out;
})();
