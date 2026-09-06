// eventnxt-frontend: src/pages/PurchaseTermsPage.jsx
//
// The Ticket Purchasing Agreement & Terms of Sale, as a public page the
// checkout card's required agree-box links to (opens in a new tab). The
// text mirrors the legal document verbatim; when the attorney revises
// the document, this page is the ONLY place the buyer-facing copy lives,
// so update it here and bump the Last Updated line. No auth, no fetch —
// a purely static page so it can never fail to load at the moment of
// purchase.

const S = {
  page: { maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px', color: '#1a1a1a', fontSize: 15, lineHeight: 1.65, fontFamily: 'system-ui, sans-serif' },
  h1: { fontSize: 26, lineHeight: 1.25, marginBottom: 4 },
  updated: { color: '#666', fontSize: 13, marginBottom: 24 },
  h2: { fontSize: 18, marginTop: 32, marginBottom: 8 },
  caps: { textTransform: 'none' },
}

function H2({ children }) {
  return <h2 style={S.h2}>{children}</h2>
}

export default function PurchaseTermsPage() {
  return (
    <div style={S.page}>
      <h1 style={S.h1}>EventNXT — Ticket Purchasing Agreement &amp; Terms of Sale</h1>
      <p style={S.updated}>Last Updated: September 6, 2026</p>

      <p>
        Please read this Ticket Purchasing Agreement &amp; Terms of Sale (&ldquo;<strong>Agreement</strong>&rdquo;)
        carefully before completing your ticket purchase or claiming an admission pass through EventNXT
        (&ldquo;<strong>EventNXT</strong>&rdquo;, &ldquo;<strong>Platform</strong>&rdquo;, &ldquo;<strong>we</strong>&rdquo;,
        &ldquo;<strong>us</strong>&rdquo;, or &ldquo;<strong>our</strong>&rdquo;).
      </p>
      <p>
        By completing a purchase, claiming a ticket, or utilizing any admission credential generated via
        EventNXT, you (&ldquo;<strong>Buyer</strong>&rdquo;, &ldquo;<strong>Attendee</strong>&rdquo;, or
        &ldquo;<strong>you</strong>&rdquo;) agree to be bound by the terms of this Agreement.
      </p>

      <H2>1. Platform Role &amp; Merchant of Record</H2>
      <p>
        <strong>Merchant of Record:</strong> EventNXT acts as the merchant of record for ticket transactions
        processed through the Platform. Payment transactions will appear on your card or payment statement
        under the Platform&rsquo;s statement descriptor.
      </p>
      <p>
        <strong>Platform as Service Provider:</strong> EventNXT provides ticketing software, check-in
        technology, and payment facilitation services. EventNXT is <strong>not</strong> the event organizer,
        host, producer, or venue owner.
      </p>
      <p>
        <strong>The Event Organizer:</strong> Admission tickets are provided by the independent third-party
        event host or organizer listed on the event page (&ldquo;<strong>Organizer</strong>&rdquo;). When you
        purchase or claim a ticket, you are acquiring a revocable license to attend an event hosted and
        operated solely by the Organizer.
      </p>

      <H2>2. Pricing, Fees &amp; Payment Processing</H2>
      <p>
        <strong>Inclusive Listing Price:</strong> The ticket price displayed at checkout represents the total
        face value. Platform operational fees are borne by the Organizer and deducted from event proceeds; no
        additional ticketing fees are added to the Buyer&rsquo;s total at checkout.
      </p>
      <p>
        <strong>Payment Processing:</strong> All payments are processed securely via Stripe under the
        Platform&rsquo;s merchant account. By providing payment information, you authorize EventNXT to charge
        your selected payment method for the full listed face value of the order.
      </p>

      <H2>3. Ticket Delivery, Usage &amp; Restrictions</H2>
      <p>
        <strong>Digital Delivery:</strong> Tickets are delivered electronically via email or within the
        Platform as unique digital credentials (e.g., QR codes). You must present your valid digital
        credential at the venue for check-in and entry.
      </p>
      <p>
        <strong>Personal Use &amp; Transfers:</strong> Tickets are intended for personal use. If you
        informally pass a ticket to a guest or friend, you do so at your own risk. EventNXT is not
        responsible for validating or honoring informal secondary transfers.
      </p>
      <p>
        <strong>Commercial Resale Prohibited:</strong> The commercial resale, auction, scalping, or
        unauthorized promotional distribution of tickets for profit is strictly prohibited. The Organizer
        reserves the right to cancel, deactivate, or invalidate any ticket reasonably suspected of being
        resold commercially, without advance notice or refund.
      </p>

      <H2>4. Guest Allotments, Invitations &amp; Complimentary Passes</H2>
      <p>
        <strong>No Cash Value:</strong> Complimentary passes, guest allotments, and promotional invitations
        have zero cash value and cannot be exchanged, redeemed for cash, or applied toward future purchases.
      </p>
      <p>
        <strong>Revocation &amp; Expiration of Unclaimed Invites:</strong> The Organizer reserves the right
        to withdraw, modify, or expire unclaimed invitations or guest allotments at any time prior to
        activation or entry. The Organizer retains the right to revoke complimentary or allotment tickets at
        its discretion up until the credential is scanned at the venue. In the event of a revocation, the
        Platform will issue a notification to the recipient, and the ticket code will be invalidated
        immediately.
      </p>

      <H2>5. Refunds, Cancellations &amp; Rescheduled Events</H2>
      <p>
        <strong>Organizer Refund Policies:</strong> Each Organizer establishes its own refund policy for its
        event, which is displayed at checkout and on your order confirmation page. Subject to the mandatory
        cancellation refund below, all refund requests are evaluated and processed in accordance with the
        Organizer&rsquo;s stated policy.
      </p>
      <p>
        <strong>Mandatory Event Cancellation Refunds:</strong> If an event is canceled entirely by the
        Organizer and not rescheduled, buyers are entitled to a mandatory full refund equal to 100% of the
        face value paid.
      </p>
      <p>
        <strong>Rescheduled or Postponed Events:</strong> If an event is postponed or rescheduled, existing
        tickets will remain valid for the new event date. Refunds for postponed events will be processed
        according to the Organizer&rsquo;s stated refund policy for rescheduled occurrences.
      </p>
      <p>
        <strong>Processing of Refunds:</strong> Refunds are remitted back to the original payment method used
        at checkout. Refunds are issued for full orders and include 100% of the amount paid by the Buyer.
        EventNXT facilitates refund distribution using event proceeds and reserve accounts held on behalf of
        the Organizer.
      </p>

      <H2>6. Referral Rewards &amp; Promoter Programs</H2>
      <p>
        <strong>Net Sales Calculation:</strong> Referral rewards, points, and promoter commissions accrue per
        sale and are calculated net of refunds. If an order associated with a referral link is refunded, the
        sale is deducted from the referrer&rsquo;s total, and any pending reward balance will be adjusted
        accordingly.
      </p>
      <p>
        <strong>Payout Availability:</strong> Earned referral payouts become payable only after the
        corresponding event has concluded.
      </p>
      <p>
        <strong>Volume Bonuses:</strong> Fixed milestone volume bonuses are considered earned and final once
        achieved. Volume bonuses are non-reversible and will not be revoked or clawed back due to subsequent
        order refunds.
      </p>

      <H2>7. Data Sharing &amp; Privacy</H2>
      <p>
        <strong>Data Shared with Organizers:</strong> To enable event operations, check-in verification, and
        venue safety, EventNXT shares Buyer and Attendee names, email addresses, order details, and check-in
        history with the specific Organizer responsible for the event purchased.
      </p>
      <p>
        <strong>Independent Controller:</strong> The Organizer acts as an independent data controller
        regarding its use of attendee data. EventNXT is not responsible for the independent data management
        practices of Organizers.
      </p>
      <p>
        <strong>Transactional Communications:</strong> EventNXT will send operational emails related to your
        order (including digital tickets, receipts, cancellation alerts, and RSVP updates). Referral
        invitations sent through the Platform carry mandatory system disclosures indicating delivery on
        behalf of the sender.
      </p>
      <p>
        <strong>Marketing Communications:</strong> Buyers will only receive marketing or promotional
        communications from the Organizer if they explicitly check the optional marketing opt-in box during
        checkout.
      </p>

      <H2>8. Venue Admission, Conduct &amp; Ejection</H2>
      <p>
        <strong>Right of Refusal:</strong> The Organizer and venue management reserve the right, without
        refund or compensation, to refuse admission to or eject any person whose conduct is deemed
        disorderly, unlawful, unsafe, or in violation of venue rules and regulations.
      </p>
      <p>
        <strong>Compliance with Rules:</strong> Attendees must comply with all health, safety, security, and
        operational guidelines established by the Organizer and the event venue.
      </p>

      <H2>9. Disclaimers &amp; Limitation of Liability</H2>
      <p>
        <strong>No Control Over Events:</strong> EventNXT provides ticketing software only. EventNXT does not
        own, control, staff, operate, perform at, or supervise events listed on the Platform.
      </p>
      <p>
        <strong>Assumption of Risk:</strong> You voluntarily assume all risks and hazards incidental to
        attending the event, whether occurring prior to, during, or after the event, including personal
        injury, illness, property damage, loss, or death.
      </p>
      <p style={S.caps}>
        <strong>Disclaimer of Liability:</strong> TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW,
        EVENTNXT, ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY
        DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED
        TO: THE CANCELATION, POSTPONEMENT, OR RESCHEDULING OF AN EVENT; THE QUALITY, SAFETY, CONTENT, LINEUP,
        SCHEDULE, OR PERFORMANCE OF ANY EVENT; ANY PERSONAL INJURY, ILLNESS, OR PROPERTY DAMAGE OCCURRING AT
        OR IN CONNECTION WITH AN EVENT; ANY ACTS, OMISSIONS, OR CONDUCT OF THE ORGANIZER, VENUE, OR OTHER
        ATTENDEES.
      </p>

      <H2>10. Contact &amp; Disputes</H2>
      <p>
        For questions regarding your ticket purchase, order status, or refund requests, please contact the
        Organizer directly using the contact details on your order confirmation page or event listing. For
        Platform technical support, contact EventNXT support via the contact options on your order page.
      </p>
    </div>
  )
}