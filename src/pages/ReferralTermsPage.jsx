// eventnxt-frontend: src/pages/ReferralTermsPage.jsx
//
// The Referral Program Terms — a public page, same pattern as
// /terms/purchase (PurchaseTermsPage.jsx): purely static, no auth, no
// fetch, and THE single referrer-facing copy. When the attorney revises
// the terms, update them here and bump the Last Updated line. Two
// sections, matching the two places referrers meet them:
//   §1 Payout Terms — linked from the portal-link email and shown in
//      summary on the portal's "Your progress" tab (disclosure only).
//   §2 Outreach Policy — the acceptance the "Refer people" tab requires
//      before the platform sends invite emails written in the
//      referrer's own words (accepted once, timestamped server-side).
// PLACEHOLDER COPY pending attorney review — structure and commitments
// mirror the Ticket Purchasing Agreement's settled positions (rewards
// post-event net of refunds; crossed volume bonuses final; organizer
// may adjust prospective terms).

const S = {
  page: { maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px', color: '#1a1a1a', fontSize: 15, lineHeight: 1.65, fontFamily: 'system-ui, sans-serif' },
  h1: { fontSize: 26, lineHeight: 1.25, marginBottom: 4 },
  updated: { color: '#666', fontSize: 13, marginBottom: 24 },
  h2: { fontSize: 18, marginTop: 32, marginBottom: 8 },
  h3: { fontSize: 15.5, marginTop: 22, marginBottom: 6 },
}

function H2({ children }) {
  return <h2 style={S.h2}>{children}</h2>
}
function H3({ children }) {
  return <h3 style={S.h3}>{children}</h3>
}

export default function ReferralTermsPage() {
  return (
    <div style={S.page}>
      <h1 style={S.h1}>EventNXT — Referral Program Terms</h1>
      <p style={S.updated}>Last Updated: September 6, 2026</p>

      <p>
        These Referral Program Terms (&ldquo;<strong>Terms</strong>&rdquo;) apply to anyone who holds a
        referral code, referral link, or referral portal for an event on the EventNXT platform
        (&ldquo;<strong>you</strong>&rdquo;, a &ldquo;<strong>Referrer</strong>&rdquo;). The rewards you can earn
        are offered by the event&rsquo;s organizer (the &ldquo;<strong>Organizer</strong>&rdquo;); EventNXT
        provides the tracking, portal, and email tools. Section 1 explains how payouts work. Section 2 is
        the Outreach Policy you must accept before sending invitations through the platform.
      </p>

      <H2>Section 1 — Referral Payout Terms</H2>

      <H3>1.1 Your terms are the ones shown in your portal</H3>
      <p>
        The reward terms for each of your codes — per-ticket amounts, percentages, points rates, and any
        volume bonus tiers — are displayed on your referral portal (&ldquo;Your progress&rdquo;). Those are
        the effective terms, and rewards accrue at the terms in effect at the time each qualifying sale
        occurs. Your acceptance of these Terms is recorded together with the full legal name you type
        when you first unlock your portal.
      </p>

      <H3>1.2 Terms can change for future sales</H3>
      <p>
        The Organizer may adjust reward terms prospectively at any time — for example between events, or
        during a campaign. <strong>Subsequent payouts will not necessarily match your initial terms.</strong>
        Any change applies only to sales made after the change; rewards already accrued at prior terms, and
        volume bonus tiers you have already crossed, are final and are not reduced by a later change. Your
        portal always reflects your current effective terms — check it before relying on a number.
      </p>

      <H3>1.3 When and how payouts settle</H3>
      <p>
        Referral rewards are calculated on completed, non-refunded sales and are settled after the event,
        net of refunds: a refunded ticket does not count toward your reward, and pending reward figures in
        your portal are estimates until the event concludes. Points-based rewards are redeemable against
        the redemption options shown in your portal and have no cash value unless a cash redemption option
        is expressly offered. Payment of cash rewards is the Organizer&rsquo;s obligation; EventNXT
        provides the accounting both of you see.
      </p>

      <H3>1.4 Honest numbers, one source</H3>
      <p>
        The sales, clicks, and reward figures in your portal are computed by the same system the Organizer
        sees — there is one set of numbers. Manifestly erroneous figures (for example, resulting from a
        technical fault or fraudulent purchases) may be corrected, and rewards attributable to fraudulent,
        cancelled, or charged-back purchases may be reversed.
      </p>

      <H2>Section 2 — Referral Outreach Policy</H2>
      <p>
        The &ldquo;Refer people&rdquo; tool sends invitation emails through EventNXT&rsquo;s systems, in
        your name and partly in your words. You must accept this Policy once before your first send. By
        accepting, you agree to all of the following:
      </p>

      <H3>2.1 Only people who would expect to hear from you</H3>
      <p>
        You will only enter people you personally know or who have a genuine existing relationship with you
        or the event, such that an invitation from you is welcome and unsurprising. You will not upload,
        enter, or send to purchased, rented, harvested, or scraped address lists, and you will not send
        bulk unsolicited email of any kind through this tool.
      </p>

      <H3>2.2 Truthful, event-related content only</H3>
      <p>
        Your subject line and message must be truthful and relate to the event. You will not impersonate
        the Organizer, EventNXT, or anyone else; make claims about the event, pricing, or rewards that you
        do not know to be accurate; or include unlawful, deceptive, harassing, or offensive content.
      </p>

      <H3>2.3 The mechanism stays intact</H3>
      <p>
        Every email sent through the tool automatically includes the recipient&rsquo;s tracked link, any
        applicable discount, and an identification line stating that the message was sent through EventNXT
        on your behalf. You will not attempt to remove, obscure, or circumvent these elements, and you will
        not copy tracked personal links out of the tool to redistribute them in bulk.
      </p>

      <H3>2.4 Respect for recipients</H3>
      <p>
        You will honor any request from a recipient to stop contacting them, and you will not re-invite
        someone who has asked not to be contacted. You will comply with all laws applicable to your sending,
        including anti-spam and electronic-communications laws in your and your recipients&rsquo;
        jurisdictions (for example, CAN-SPAM in the United States).
      </p>

      <H3>2.5 Enforcement</H3>
      <p>
        EventNXT and the Organizer may suspend or revoke your sending access, your codes, or your portal at
        any time for suspected abuse of this Policy, and may void rewards attributable to sends that
        violate it. You are responsible for the content you write; sends that generate spam complaints,
        legal claims, or deliverability damage may result in permanent removal from the program. This tool
        is provided to help genuine word-of-mouth — use it that way.
      </p>

      <H3>2.6 Data</H3>
      <p>
        Names and email addresses you enter are used to send the invitation, track clicks and purchases for
        reward attribution, and show you and the Organizer the results. Enter only contact details you have
        the right to share for this purpose.
      </p>

      <p style={{ marginTop: 36, color: '#666', fontSize: 13.5 }}>
        Questions about these Terms should be directed to the event&rsquo;s Organizer, or to EventNXT
        support. {/* PLACEHOLDER: support address pending — same address as Purchasing Agreement §10. */}
      </p>
    </div>
  )
}