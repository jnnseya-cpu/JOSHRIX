/**
 * JOSHRIX Communication Event Architecture — one event engine, every message.
 * Catalogue events fan out across email, in-app, SMS and push by default;
 * WhatsApp rides the SMS wiring when a provider is connected.
 * `mandatory` events bypass user opt-outs (security, money, legal — the notices
 * a platform is obliged to deliver).
 * Channel key: e = email · i = in-app · s = sms · p = push
 */

export type CommSeverity = "info" | "success" | "warning" | "critical";
export type CommChannel = "email" | "inapp" | "sms" | "push";

export interface CommEvent {
  id: string;
  name: string;
  /** subject/preview template — {{var}} placeholders substituted at send time */
  subject: string;
  severity: CommSeverity;
  channels: CommChannel[];
  mandatory: boolean;
}
export interface CommCategory { key: string; name: string; events: CommEvent[]; }

const CH: Record<string, CommChannel> = { e: "email", i: "inapp", s: "sms", p: "push" };
/** row: [id, name, subject, severity, channels "eisp", mandatory?] */
type Row = [string, string, string, CommSeverity, string, boolean?];
const ev = (r: Row): CommEvent => ({
  id: r[0], name: r[1], subject: r[2], severity: r[3],
  channels: r[4].split("").map((c) => CH[c]), mandatory: !!r[5],
});
const cat = (key: string, name: string, rows: Row[]): CommCategory => ({ key, name, events: rows.map(ev) });

export const COMM_CATALOGUE: CommCategory[] = [
  cat("identity", "Identity & Account", [
    ["account.registration.requested", "Account requested", "Welcome to JOSHRIX — confirm your account", "info", "ei"],
    ["account.registration.received", "Registration received", "We received your registration", "info", "ei"],
    ["account.email_verification_required", "Email verification required", "Verify your email address", "warning", "ei"],
    ["account.verification.successful", "Verification successful", "Your account is verified", "success", "ei"],
    ["account.verification.failed", "Verification failed", "Verification could not be completed", "warning", "ei"],
    ["account.verification.expired", "Verification expired", "Your verification link expired", "warning", "ei"],
    ["account.registration.abandoned", "Registration abandoned", "Finish setting up your JOSHRIX studio", "info", "ei"],
    ["account.activated", "Account activated", "Your JOSHRIX studio is live", "success", "eip"],
    ["profile.updated", "Profile updated", "Your profile changes were saved", "info", "i"],
    ["invitation.sent", "User invited", "{{actor}} invited you to JOSHRIX", "info", "ei"],
    ["invitation.accepted", "Invitation accepted", "{{name}} accepted your invitation", "success", "i"],
    ["invitation.expired", "Invitation expired", "Your invitation has expired", "info", "ei"],
    ["account.deletion_requested", "Account deletion requested", "Account deletion requested", "warning", "ei", true],
    ["account.deletion_completed", "Account deletion completed", "Your account has been deleted", "info", "e", true],
  ]),
  cat("security", "Login & Security", [
    ["auth.login.success", "Successful login", "New sign-in to your JOSHRIX account", "info", "i"],
    ["auth.login.failed", "Failed login", "Failed sign-in attempt", "warning", "i"],
    ["auth.login.suspicious", "Suspicious login", "Unusual sign-in detected", "critical", "eis", true],
    ["auth.device.new", "New device detected", "New device signed in", "warning", "ei", true],
    ["password.forgot", "Forgot password", "Reset your JOSHRIX password", "info", "ei"],
    ["password.reset_link", "Password reset link", "Your password reset link", "info", "ei"],
    ["password.reset.successful", "Password reset successful", "Your password was reset", "success", "eis", true],
    ["password.changed", "Password changed", "Your password was changed", "success", "ei", true],
    ["mfa.otp_code", "OTP code", "Your JOSHRIX verification code", "info", "eis"],
    ["mfa.enabled", "MFA enabled", "Two-factor authentication enabled", "success", "ei", true],
    ["mfa.disabled", "MFA disabled", "Two-factor authentication disabled", "warning", "eis", true],
    ["security.alert", "Security alert", "Security alert on your account", "critical", "eis", true],
    ["account.locked", "Account locked", "Your account has been locked", "critical", "eis", true],
    ["account.unlocked", "Account unlocked", "Your account is unlocked", "success", "ei"],
  ]),
  cat("wallet", "Wallet & ACU", [
    ["wallet.created", "Wallet created", "Your ACU wallet is ready", "success", "i"],
    ["acu.granted", "ACUs granted", "{{amount}} ACUs were added to your wallet", "success", "eip"],
    ["acu.low_balance", "Low balance", "Your ACU balance is running low", "warning", "ip"],
    ["acu.depleted", "Balance depleted", "You're out of ACUs — top up to keep forging", "warning", "eip"],
    ["acu.topup.successful", "Top-up successful", "Payment received — {{amount}} ACUs credited", "success", "ei"],
    ["acu.topup.failed", "Top-up failed", "Your ACU payment failed", "warning", "eis", true],
    ["acu.refund.auto", "Automatic refund", "A failed forge was refunded to your wallet", "info", "ei"],
    ["acu.expiring", "ACUs expiring", "Some of your ACUs expire soon", "warning", "ei"],
    ["wallet.refill.tester", "Tester refill", "Your tester wallet was refilled", "info", "i"],
    ["wallet.deleted", "Wallet deleted", "Your wallet has been deleted", "info", "e", true],
  ]),
  cat("billing", "Payments & Billing", [
    ["payment.pending", "Payment pending", "Payment is processing", "info", "i"],
    ["payment.successful", "Payment successful", "Payment received — {{amount}}", "success", "ei"],
    ["payment.failed", "Payment failed", "Your payment failed", "warning", "eis", true],
    ["payment.retry", "Payment retry", "We'll retry your payment", "info", "ei"],
    ["card.expiring", "Card expiring", "Your card expires soon", "warning", "ei"],
    ["card.expired", "Card expired", "Your card has expired", "warning", "ei"],
    ["refund.processed", "Refund processed", "Your refund was processed", "success", "ei"],
    ["invoice.generated", "Invoice generated", "Invoice {{number}} is ready", "info", "ei"],
    ["invoice.overdue", "Invoice overdue", "Invoice {{number}} is overdue", "warning", "eis", true],
    ["subscription.activated", "Subscription activated", "Your {{plan}} subscription is active", "success", "ei"],
    ["subscription.renewed", "Subscription renewed", "Your subscription renewed", "info", "ei"],
    ["subscription.cancelled", "Subscription cancelled", "Your subscription was cancelled", "warning", "ei"],
  ]),
  cat("forge", "Forge & Creation", [
    ["forge.blueprint.ready", "Blueprint ready", "Your blueprint for {{game}} is ready", "success", "ip"],
    ["forge.started", "Forge started", "The agent fleet is forging {{game}}", "info", "i"],
    ["forge.completed", "Forge completed", "{{game}} is built — playtest it now", "success", "eip"],
    ["forge.failed_refunded", "Forge failed — refunded", "Generation failed; your ACUs were refunded", "warning", "ei"],
    ["forge.timeout_refunded", "Forge timed out — refunded", "The forge ran long; ACUs refunded — try again", "warning", "ei"],
    ["forge.qa.passed", "QA passed", "{{game}} passed quality checks", "success", "i"],
    ["forge.refine.suggested", "Refine suggested", "A refine pass could improve {{game}}", "info", "i"],
    ["agent.intervention_required", "Action needed", "Action needed on {{item}}", "critical", "eip", true],
    ["forge.daily_summary", "Daily forge summary", "Your forge activity today", "info", "e"],
  ]),
  cat("moderation", "Moderation & Publishing", [
    ["game.submitted", "Game submitted", "{{game}} entered moderation review", "info", "ei"],
    ["game.in_review", "In review", "{{game}} is being reviewed", "info", "i"],
    ["game.approved", "Game approved", "{{game}} is LIVE — share your link", "success", "eip"],
    ["game.rejected", "Game rejected", "{{game}} needs changes before going public", "warning", "ei"],
    ["game.revision_requested", "Revision requested", "Moderation asked for changes to {{game}}", "warning", "ei"],
    ["game.unpublished", "Game unpublished", "{{game}} was removed from public play", "warning", "ei", true],
    ["moderation.queue_digest", "Review queue digest", "{{count}} games await your review", "info", "ep"],
    ["game.link_live", "Play link live", "Your play link is public: {{url}}", "success", "eip"],
    ["game.first_play", "First play!", "Someone just played {{game}} for the first time", "success", "ip"],
    ["game.milestone_plays", "Play milestone", "{{game}} passed {{count}} plays", "success", "eip"],
  ]),
  cat("arcade", "Arcade & Players", [
    ["arcade.featured", "Featured in the Arcade", "{{game}} is featured on the Arcade shelf", "success", "eip"],
    ["arcade.trending", "Trending", "{{game}} is trending in the Arcade", "success", "ip"],
    ["player.report_received", "Player report", "A player reported {{game}}", "warning", "ei", true],
    ["arcade.weekly_digest", "Arcade weekly", "This week in the Arcade", "info", "e"],
  ]),
  cat("marketplace", "Marketplace & Sales", [
    ["listing.created", "Listing created", "{{game}} is listed on the marketplace", "info", "i"],
    ["listing.approved", "Listing approved", "Your listing for {{game}} is approved", "success", "ei"],
    ["sale.completed", "Sale!", "{{game}} sold for {{amount}}", "success", "eip"],
    ["sale.refunded", "Sale refunded", "A sale of {{game}} was refunded", "warning", "ei"],
    ["remix.forked_of_yours", "Your game was remixed", "{{game}} was forked — lineage royalties active", "success", "eip"],
    ["royalty.earned", "Royalty earned", "Lineage royalty earned: {{amount}}", "success", "eip"],
    ["listing.flagged", "Listing flagged", "Your listing was flagged for review", "warning", "ei", true],
    ["marketplace.weekly_summary", "Sales weekly", "Your marketplace week in numbers", "info", "e"],
  ]),
  cat("payouts", "Payouts & KYC", [
    ["payout.requested", "Payout requested", "Payout request received — {{amount}}", "info", "ei"],
    ["payout.approved", "Payout approved", "Your payout was approved", "success", "ei"],
    ["payout.paid", "Payout paid", "{{amount}} is on its way to you", "success", "eip"],
    ["payout.failed", "Payout failed", "Your payout could not be completed", "warning", "eis", true],
    ["payout.held", "Payout held", "Your payout is held pending review", "warning", "ei", true],
    ["kyc.required", "Verification required", "Identity verification needed for payouts", "warning", "ei", true],
    ["kyc.approved", "KYC approved", "You're verified for payouts", "success", "ei"],
    ["kyc.rejected", "KYC rejected", "We couldn't verify your identity", "warning", "ei", true],
  ]),
  cat("distribution", "Store Distribution", [
    ["dist.queued", "Queued", "{{game}}: joined the distribution queue ({{ref}})", "info", "ei"],
    ["dist.packaging", "Packaging", "{{game}}: being packaged for {{store}}", "info", "i"],
    ["dist.submitted", "Submitted to store", "{{game}}: submitted to {{store}}", "info", "eip"],
    ["dist.in_store_review", "In store review", "{{game}}: in {{store}} review (1–7 days)", "info", "i"],
    ["dist.live", "Live in store!", "{{game}} is LIVE on {{store}}", "success", "eip"],
    ["dist.needs_changes", "Store needs changes", "{{store}} needs changes on {{game}}", "warning", "eip", true],
    ["dist.update_pushed", "Update pushed", "{{game}}: update submitted to {{store}}", "info", "i"],
    ["dist.rejected", "Store rejected", "{{store}} rejected {{game}} — next steps inside", "warning", "ei", true],
  ]),
  cat("growth", "Growth & Referrals", [
    ["referral.link_created", "Referral link created", "Your growth partner link is live", "info", "i"],
    ["referral.signup", "Referral signup", "Someone joined with your link", "info", "ip"],
    ["referral.first_payment", "Paid referral!", "Your referral made their first payment", "success", "eip"],
    ["referral.tier_upgraded", "Tier upgraded", "You reached {{tier}} status", "success", "eip"],
    ["referral.commission_unlocked", "Commission unlocked", "1% lifetime commission is now unlocked", "success", "ei"],
    ["referral.commission_earned", "Commission earned", "Commission earned: {{amount}}", "success", "eip"],
    ["referral.held_fraud", "Referral held", "A referral is held for verification", "warning", "ei", true],
    ["referral.payout_paid", "Commission paid", "Your commission payout was sent", "success", "ei"],
  ]),
  cat("platform", "Platform & Legal", [
    ["system.maintenance_scheduled", "Scheduled maintenance", "Scheduled maintenance on {{date}}", "info", "ei"],
    ["system.maintenance_emergency", "Emergency maintenance", "Emergency maintenance in progress", "warning", "eis", true],
    ["system.outage", "System outage", "Service disruption", "critical", "eis", true],
    ["system.service_restored", "Service restored", "Service restored", "success", "ei"],
    ["policy.updated", "Policy updated", "Our terms or policies changed", "info", "ei", true],
    ["privacy.consent_request", "Consent request", "We need your consent", "info", "ei", true],
    ["privacy.data_export_ready", "Data export ready", "Your data export is ready", "success", "ei"],
    ["blog.post_published", "New blog post", "New on the JOSHRIX blog: {{title}}", "info", "i"],
    ["executive.alert", "Executive alert", "Executive alert", "critical", "eis", true],
    ["support.reply", "Support reply", "Update on your support request", "info", "ei"],
  ]),
];

export function commStats() {
  const all = COMM_CATALOGUE.flatMap((c) => c.events);
  const perChannel: Record<CommChannel, number> = { email: 0, inapp: 0, sms: 0, push: 0 };
  for (const e of all) for (const ch of e.channels) perChannel[ch]++;
  return {
    events: all.length,
    categories: COMM_CATALOGUE.length,
    mandatory: all.filter((e) => e.mandatory).length,
    channels: perChannel,
  };
}

export function findCommEvent(id: string): CommEvent | null {
  for (const c of COMM_CATALOGUE) for (const e of c.events) if (e.id === id) return e;
  return null;
}

/** {{var}} substitution with safe fallbacks for previews */
export function renderTemplate(tpl: string, vars: Record<string, string> = {}): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? ({ game: "Mythic Pet Kingdom", amount: "£25.00", number: "JX-0042", plan: "Creator Pro", store: "Google Play", ref: "DIST-7", count: "3", tier: "Connector", url: "joshrix.com/play/g-demo", actor: "JOSHRIX", name: "A creator", item: "your game", date: "Saturday", title: "New post" } as Record<string, string>)[k] ?? k);
}
