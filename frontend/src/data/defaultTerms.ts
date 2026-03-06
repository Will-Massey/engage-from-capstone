export const generateTermsAndConditions = (companyDetails: any) => {
  const {
    name = '[Your Company Name]',
    companyNumber = '[Company Number]',
    address = '[Registered Office Address]',
    professionalBody = '[Professional Body]',
    insurerName = '[Insurer Name]',
    governingLaw = 'England and Wales',
    fcaAuthorised = false,
  } = companyDetails;

  const fcaText = fcaAuthorised 
    ? 'We are authorised by the Financial Conduct Authority (FCA) to provide regulated investment advice.'
    : 'We are not authorised by the Financial Conduct Authority (FCA) to provide regulated investment advice. Any incidental investment or consumer credit services will be referred to an FCA-authorised third party.';

  return `STANDARD TERMS AND CONDITIONS OF BUSINESS

${name} Ltd (Company Number ${companyNumber}, Registered Office ${address})
("We", "Us", "Our", "the Firm")

These Standard Terms and Conditions of Business ("Terms") apply to all services we provide and form part of our contract with you together with the accompanying Proposal / Engagement Letter and any Schedules of Services. They are governed by the law of ${governingLaw}.

By instructing us or accepting our services (including by providing information or authorising work), you agree to these Terms.

1. OUR PROFESSIONAL RESPONSIBILITIES AND AUTHORISATION

1.1 We are registered with ${professionalBody} and will comply with their Code of Ethics and professional standards at all times (including the 2025 revisions addressing the impact of technology and AI).

1.2 We maintain professional indemnity insurance with ${insurerName} (territorial coverage: United Kingdom only). Details available on request.

1.3 ${fcaText}

2. CLIENT IDENTIFICATION, VERIFICATION AND ANTI-MONEY LAUNDERING

2.1 We are required to comply with the Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017 (as amended) ("MLR 2017"), the Proceeds of Crime Act 2002 (POCA), and related guidance (including CCAB AML Guidance for the Accountancy Sector).

2.2 We will request and retain identification evidence for you, beneficial owners, and persons acting on your behalf (including electronic database checks). We may make searches of appropriate databases. You agree to provide such information promptly. Failure to do so may prevent us from acting.

2.3 We have a statutory duty under POCA s.330 to report suspicions of money laundering or terrorist financing to the National Crime Agency (NCA). We cannot inform you if we make such a report (tipping-off offence). We will not undertake work solely to identify suspicions.

2.4 We comply with the Criminal Finances Act 2017 (corporate offence of failure to prevent facilitation of tax evasion) and the Bribery Act 2010.

3. YOUR RESPONSIBILITIES

You agree to:
• Provide us with accurate, complete, and timely information and documents.
• Inform us immediately of any changes in circumstances.
• Respond promptly to requests and communications.
• Keep proper records (e.g., 5+ years for tax purposes).
• Ensure any information you supply to HMRC or others is correct.

We will not be liable for any loss arising from incomplete, inaccurate, or misleading information you (or others) provide, or from your failure to act on our advice or reply promptly.

4. USE OF ARTIFICIAL INTELLIGENCE

4.1 To deliver services efficiently, accurately, and cost-effectively, we may use artificial intelligence tools and technologies ("AI Tools"), including AI-enabled software, generative AI, large language models, or machine-learning systems (whether developed internally, provided by third-party vendors, or accessed via cloud platforms).

4.2 Any use of AI Tools will be subject to our professional judgement and oversight. We will not rely solely on AI outputs without appropriate review, verification, and application of our expertise. AI Tools are used as an aid only and do not replace the professional skill, care, and responsibility we owe to you.

4.3 We will take reasonable steps to protect your confidential information and personal data when using AI Tools, in line with our obligations under data protection law (UK GDPR / Data Protection Act 2018), our confidentiality duties, and professional ethics. This may include using secure, approved providers with appropriate safeguards (e.g., no unauthorised training on client data unless expressly agreed). We will not input your confidential or sensitive information into public or unauthorised AI systems without your prior written consent.

4.4 We may disclose in our deliverables (e.g., reports, advice, or correspondence) where AI Tools have materially contributed to the work. You acknowledge that AI outputs may contain limitations, inaccuracies, or "hallucinations," and we accept no additional liability beyond these Terms for such inherent characteristics provided we have applied reasonable professional care.

4.5 If you have any concerns about our use of AI Tools or wish to restrict or prohibit their use for your engagement, please notify us in writing as soon as possible. We will discuss reasonable adjustments and confirm any changes in writing (additional fees may apply if restrictions increase our workload materially).

4.6 Further details of our AI usage practices (including approved tools and data-handling controls) are available in our firm's AI Usage Policy / Privacy Notice on request.

5. OUR SERVICES AND SCOPE

Services are limited to those expressly set out in the Engagement Letter and Schedules. Any additional work requires written agreement and may incur extra fees. We provide advice with reasonable care and skill but do not guarantee specific outcomes (e.g., tax savings).

6. FEES, PAYMENT TERMS AND CLIENT MONIES

6.1 Fees are calculated on the basis of time spent, skill, responsibility, value, and risk (or fixed fees as agreed). Estimates are not binding unless stated.

6.2 Fees are exclusive of VAT (added at the prevailing rate). Disbursements and expenses are charged additionally.

6.3 Invoices are due within 30 days. We reserve the right to charge statutory interest and compensation under the Late Payment of Commercial Debts (Interest) Act 1998 (or 2% per month if higher).

6.4 We may suspend or terminate services if fees remain unpaid after written notice.

6.5 We may hold client monies in a segregated client account in accordance with ${professionalBody} Client Money Rules. Interest is paid only where significant (typically over £25 or as agreed).

6.6 We may receive commissions or benefits from third-party introductions and will notify you in writing.

7. DATA PROTECTION (UK GDPR AND DATA PROTECTION ACT 2018)

7.1 We process personal data in accordance with the UK General Data Protection Regulation (UK GDPR), Data Protection Act 2018, and Privacy and Electronic Communications Regulations 2003 (PECR) (as amended).

7.2 We act as an independent data controller. Our lawful bases for processing include performance of the contract, legal obligations, and legitimate interests. Full details are in our Privacy Notice (available on request).

7.3 You must ensure you have a lawful basis to provide us with personal data (including consent where required) and have informed data subjects.

7.4 We maintain appropriate security measures. We may transfer data to third-party service providers (including overseas) under appropriate safeguards.

7.5 We will notify you promptly of any data subject requests or breaches where legally required. Retention: we keep data for at least 7 years (or as required by law/professional rules).

7.6 For the avoidance of doubt, our use of AI Tools is conducted in compliance with this section and our Privacy Notice.

8. CONFIDENTIALITY AND CONFLICTS OF INTEREST

8.1 All communications are confidential. We will not disclose information except as required by law, regulation, our insurers, or professional review.

8.2 We may subcontract work (subcontractors bound by confidentiality).

8.3 We will notify you of any conflict of interest. Where a conflict cannot be managed, we may cease acting.

9. ELECTRONIC COMMUNICATION AND ONLINE FILING

9.1 We may communicate and file documents electronically (e.g., HMRC, Companies House). You accept risks of non-receipt, interception, or corruption. We use virus-scanning software but accept no liability for viruses or errors.

9.2 Mandatory electronic filing (e.g., iXBRL, tax returns) uses third-party software; we accept no liability for rejections due to software deficiencies.

10. RETENTION OF RECORDS AND INTELLECTUAL PROPERTY

10.1 We retain working papers and copies; original documents are returned to you. We destroy records older than 7 years unless required otherwise.

10.2 We retain copyright in all documents we prepare.

11. LIMITATION OF LIABILITY

11.1 We provide services with reasonable care and skill. Our total liability to you (or any third party) for any loss, damage, or claim arising from our engagement is limited to the higher of 5× our fees for the relevant services or the limit of our professional indemnity insurance.

11.2 We exclude liability for:
• Losses caused by your acts/omissions, incomplete information, or failure to act on advice.
• Indirect, consequential, or special losses.
• Circumstances beyond our reasonable control (force majeure).
• Any third-party advice or services.

11.3 Nothing limits our liability for death/personal injury from negligence or fraud.

11.4 You agree not to bring claims against individual directors/staff personally.

11.5 Our work is for your sole use and not to be relied upon by third parties without our written consent.

12. TERMINATION / DISENGAGEMENT

12.1 Either party may terminate with 30 days' written notice (or immediately for material breach or non-payment).

12.2 On termination we will issue a disengagement letter and provide handover information on request (reasonable fee may apply). We may exercise a lien over documents until fees are paid.

12.3 Fees remain payable for work performed up to termination.

13. COMPLAINTS

We aim for high-quality service. If dissatisfied, contact us promptly. We will investigate promptly. If unresolved, you may refer to our professional body ${professionalBody} or the Legal Ombudsman (if applicable).

14. OTHER PROVISIONS

14.1 Lien: We may exercise a lien over your documents and funds until fees are paid.

14.2 Assignment: Neither party may assign rights without consent.

14.3 Third Parties: No rights under the Contracts (Rights of Third Parties) Act 1999.

14.4 Entire Agreement: These Terms, the Engagement Letter, and Schedules form the whole agreement.

14.5 Changes: We may update these Terms with reasonable notice.

14.6 Force Majeure: We are not liable for delays beyond our reasonable control.

15. GOVERNING LAW AND JURISDICTION

These Terms and our engagement are governed by the law of ${governingLaw}. The courts of ${governingLaw} have exclusive jurisdiction.

ACCEPTANCE

Please sign below to confirm acceptance of these Terms. Work will not commence until we receive satisfactory identification and signed acceptance (unless otherwise agreed).

Date: ___________________

Electronic Signature: ___________________

Signatory Name: ___________________

Signatory Position: ___________________

By signing above, you confirm that:
1. You have read, understood, and agree to these Terms and Conditions
2. You have authority to bind the client organisation
3. The information provided is accurate and complete
4. You consent to electronic communication and filing where applicable
`;
};

export default generateTermsAndConditions;
