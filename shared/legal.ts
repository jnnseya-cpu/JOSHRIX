/**
 * WHO THE DATA CONTROLLER IS, IN ONE PLACE.
 *
 * Justin supplied the ICO registration number on 17 Nov 2026. It belongs on the
 * public legal pages and in the site's structured data, which means it is about
 * to exist in several files at once — and a legal identifier that is correct in
 * three places and stale in a fourth is worse than one that is absent, because
 * a wrong registration number on a privacy policy is a misleading statement
 * about a regulated registration.
 *
 * So it is declared here, exactly once, and `tests/t51-legal-identity.js`
 * asserts that every page which states a registration number states THIS one.
 * The static pages necessarily carry the digits as literal text — they are
 * plain HTML and cannot import a constant — so the test is what keeps them
 * honest.
 *
 * WHY THE PRIVACY PAGE NEEDED THIS ANYWAY. UK GDPR Article 13(1)(a) requires
 * the identity and contact details of the controller to be given to the data
 * subject. The privacy policy described in detail what is collected, why, and
 * for how long, and never said WHO was collecting it. That was a real gap
 * rather than a presentational one, and the registration number is the natural
 * occasion to close it.
 *
 * NOT VERIFIED FROM HERE, and not presented as if it were: this environment
 * cannot reach ico.org.uk (the proxy refuses it), so the number is published as
 * supplied by its owner. Its shape matches the ICO's current scheme — a C
 * followed by seven digits — which is a format check and nothing more.
 */
export const LEGAL = {
  /**
   * The controller's identity as every public page already names it.
   *
   * FLAGGED, NOT DECIDED. /llms.txt states "Operated by Groupe Nseya Digital /
   * JNN Global", while the Terms say "JOSHRIX Studio ... operates joshrix.com"
   * and the footer of every page is "JOSHRIX Studio". A privacy policy should
   * name the LEGAL ENTITY that holds the registration, which may be the former
   * with the latter as its trading name.
   *
   * This value follows the existing public copy rather than silently
   * introducing a different entity onto a legal page. If C2089949 is registered
   * to Groupe Nseya Digital / JNN Global, change this one line to that name and
   * keep JOSHRIX Studio as the trading name — every page and the structured
   * data follow from here, and tests/t51 proves they did.
   */
  controller: "JOSHRIX Studio",
  /** Data-protection supervisory authority for the United Kingdom. */
  regulator: "Information Commissioner's Office (ICO)",
  regulatorSite: "ico.org.uk",
  /** The controller's entry on the ICO's public register of fee payers. */
  icoRegistration: "C2089949",
  /** Governing law already stated in the Terms — kept here so the two cannot
   *  drift apart without a test noticing. */
  jurisdiction: "England and Wales",
  /** Where a data-subject request or a complaint actually goes. There is no
   *  published mailbox for it: the contact form is the route, which keeps one
   *  intake rather than an address that nobody monitors. */
  contactPath: "/contact",
} as const;

/** The format the ICO's current scheme uses. A shape check, NOT a confirmation
 *  that the number is registered or that it belongs to this controller — only
 *  the register can say that. */
export const ICO_NUMBER_PATTERN = /^(?:C\d{7}|Z[A-B]?\d{6,7})$/;
