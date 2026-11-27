import { deliveredProjects, establishedYear } from './agency';

export type ContentSection = { heading: string; paragraphs: string[]; bullets?: string[]; sources?: { label: string; href: string }[] };
export type PublicPage = {
  slug: string;
  title: string;
  description: string;
  heading: string;
  eyebrow: string;
  introduction: string;
  sections: ContentSection[];
  related: string[];
  serviceType?: string;
};

export const publicPages: PublicPage[] = [
  {
    slug: 'website-development-greater-noida',
    title: 'Website Development Services in Greater Noida | Websynk',
    description: 'Plan a responsive business website with Websynk. Explore website scope, design, development, technical SEO and launch preparation for Greater Noida businesses.',
    heading: 'Website development in Greater Noida, built around your business.',
    eyebrow: 'WEBSITE DEVELOPMENT · GREATER NOIDA',
    introduction: 'A useful website makes your business easy to understand and easy to contact. Websynk Technologies brings design and development together for businesses in Greater Noida and Noida, with a physical office in Sector 142, Noida.',
    serviceType: 'Website development',
    sections: [
      {
        heading: 'Start with what visitors need to do',
        paragraphs: [
          'A website brief should begin with the people using it. A local service business may need clear service information, location details and a reliable way to request a quotation. A corporate website may need a broader content structure, downloadable information and a manageable publishing process. An online store needs a different set of product and checkout decisions.',
          'We discuss these requirements before selecting layouts or features. The goal is a defined scope that connects your business objectives with a practical customer journey. This also makes proposals easier to compare: you can see which pages, functions and content responsibilities are included.',
        ],
        bullets: ['Business and corporate websites', 'Custom website development and landing pages', 'Website redesign and responsive web design', 'CMS and admin dashboard requirements assessed during consultation', 'E-commerce websites with an agreed product and purchase flow'],
      },
      {
        heading: 'Design for screens, content and real interactions',
        paragraphs: [
          'Responsive design is more than making a desktop layout smaller. Navigation, headings, forms and calls to action need to remain understandable on narrow screens. We consider how someone reading on a phone can find a service, compare the details and take the next step without unnecessary friction.',
          'Content planning is part of this work. Useful page titles, descriptive headings and a logical relationship between services help visitors find the information they need. Real photography, accurate business details and a clear explanation of the offer are more valuable than filling every section with repeated marketing claims.',
        ],
      },
      {
        heading: 'Build a foundation that search engines can understand',
        paragraphs: [
          'A website should make important information available in readable HTML, with working links and appropriate status codes. The development scope can include unique metadata, canonical URLs, a sitemap, an appropriate robots.txt file and structured data that reflects the visible business information.',
          'Technical preparation helps a search engine discover and interpret a website; it does not guarantee a ranking. Content, competition, local business information and the ongoing quality of the site also matter. We keep this distinction clear when discussing development and SEO work.',
        ],
      },
      {
        heading: 'Agree the launch and handover details early',
        paragraphs: [
          'Before launch, the checklist should cover mobile layouts, internal links, enquiry journeys, image behaviour and any agreed integrations. If an existing site is being replaced, its useful URLs and redirects need attention so visitors are not sent to missing pages.',
          'Hosting, domain ownership, access, content editing and future support should be explicit in the proposal. We provide website maintenance and support with scope agreed before approval. A development quotation should make clear what happens after launch rather than leaving those responsibilities to assumption.',
        ],
        bullets: ['Share your existing website or reference sites', 'List required pages, features and integrations', 'Identify who will supply copy, images and product data', 'Explain your desired timeline and approval process'],
      },
    ],
    related: ['ecommerce-website-development', 'seo-services-greater-noida', 'contact-us'],
  },
  {
    slug: 'digital-marketing-greater-noida',
    title: 'Digital Marketing Solutions in Greater Noida | Websynk',
    description: 'Explore digital marketing planning for Greater Noida businesses: audience research, SEO, paid campaign requirements, content and meaningful enquiry measurement.',
    heading: 'Digital marketing in Greater Noida with a clear direction.',
    eyebrow: 'DIGITAL MARKETING · GREATER NOIDA',
    introduction: 'More visibility is useful when it reaches the right audience. Websynk Technologies helps businesses connect their website, content and digital marketing priorities around the actions that matter to their business.',
    serviceType: 'Digital marketing',
    sections: [
      {
        heading: 'Define the enquiry you want to generate',
        paragraphs: [
          'A campaign needs a more precise objective than getting more traffic. Consider the service or product being promoted, the people likely to need it and the information they need before contacting you. A quotation request, an appointment enquiry and an online purchase are different outcomes, and each needs a suitable website journey.',
          'During consultation, share your service area, typical customer questions, current website and any existing campaign information you are authorised to provide. This helps define the audience, messages and actions that an initial strategy should prioritise.',
        ],
      },
      {
        heading: 'Connect search, content and your website',
        paragraphs: [
          'SEO and content planning can help answer the questions customers ask when choosing a provider. Useful service pages, accurate contact information and relevant explanations give people a stronger basis for deciding whether your business is a good fit.',
          'Your website also needs to support the campaign. Visitors should arrive on a page that matches the message they clicked, explains the offer and presents a clear next step. Sending every visitor to the same broad homepage can make it harder to assess a specific service or promotion.',
        ],
        bullets: ['Search engine optimisation and local relevance', 'Content and social media planning', 'Lead generation journeys with clear enquiry actions', 'Landing page and conversion review', 'Performance measurement requirements agreed before launch'],
      },
      {
        heading: 'Discuss paid advertising requirements before choosing a platform',
        paragraphs: [
          'If you are considering Google Ads or Meta Ads, start with the objective, audience, offer and available landing pages. Search campaigns can reach people actively looking for an answer; social campaigns may introduce an offer to an audience that is not searching for it at that moment. The right combination depends on your circumstances.',
          'We provide Google Ads and Meta Ads services covering campaign setup, audience targeting, optimisation and reporting. The written proposal defines the platforms, creative requirements and reporting scope for your project. Advertising spend and service fees are distinguished, and account access should remain under the owner’s control.',
        ],
      },
      {
        heading: 'Measure meaningful actions, then improve the journey',
        paragraphs: [
          'Useful reporting connects activity with agreed outcomes. Website visits, WhatsApp clicks and phone-link clicks can show interest, but they are not automatically qualified leads or completed sales. Your business needs a way to identify which enquiries were relevant and what happened after the first conversation.',
          'When analytics access and consent requirements are agreed, measurement can help identify pages or campaigns worth improving. Performance review should explain what was observed, what remains uncertain and what change will be tested next. No agency can responsibly guarantee a fixed number of sales from a general marketing brief.',
        ],
      },
      {
        heading: 'Local relevance without invented office locations',
        paragraphs: [
          'Our office is in Sector 142, Noida. We welcome project enquiries from Greater Noida, Greater Noida West, Noida Extension and surrounding Delhi NCR areas. Share your exact location and requirements so delivery arrangements and service availability can be confirmed.',
          'For a business serving local customers, accurate address and telephone information is part of building trust. Local pages should explain useful service information; they should not suggest offices or branches that do not exist.',
        ],
      },
    ],
    related: ['seo-services-greater-noida', 'website-development-greater-noida', 'contact-us'],
  },
  {
    slug: 'seo-services-greater-noida',
    title: 'SEO Services & Local Search Planning in Greater Noida | Websynk',
    description: 'Understand Websynk’s SEO approach: technical review, useful service content, accurate local information and measurable improvements for Greater Noida businesses.',
    heading: 'SEO services in Greater Noida, built on a clear foundation.',
    eyebrow: 'SEO SERVICES · GREATER NOIDA',
    introduction: 'SEO starts with a website that people can use and search engines can understand. Websynk Technologies connects technical website work, relevant content and accurate local information into a practical improvement plan.',
    serviceType: 'Search engine optimisation',
    sections: [
      {
        heading: 'Begin with the condition of the existing website',
        paragraphs: [
          'Before changing headings or writing more pages, review what is already there. Important questions include whether public pages return successful responses, whether their main content is available in HTML and whether internal links lead to useful destinations. Existing rankings and enquiries should be understood where account data is available.',
          'A technical review can examine page titles, descriptions, canonical URLs, indexability, sitemaps, broken links, mobile behaviour and page speed. Findings should be prioritised by their impact on visitors and search access, rather than presented as a long list of disconnected scores.',
        ],
      },
      {
        heading: 'Give each service page a clear purpose',
        paragraphs: [
          'A useful service page answers the questions someone asks when deciding whether to enquire: what is included, who it is for, how the process works and what information is needed for an estimate. Closely related terms can be covered naturally on one strong page instead of repeated across near-identical pages.',
          'Descriptive headings and relevant internal links help connect those pages. We avoid hidden text, artificial keyword-density targets and promises of guaranteed first positions. The objective is useful information that reflects the business, not a page written around repeated location phrases.',
        ],
        bullets: ['Technical SEO and crawlability review', 'Service-page structure and metadata planning', 'Content gaps based on customer questions', 'Internal linking and canonical consistency', 'Search Console measurement when owner access is available'],
      },
      {
        heading: 'Build local relevance from accurate information',
        paragraphs: [
          'For a local business, the name, address and phone number should match the information that customers use elsewhere. The physical office should be distinguished from the areas where services are offered. Opening hours, profiles and map links should only be added when the owner confirms they are correct.',
          'If a Google Business Profile exists, its owner can review categories, services, contact details and genuine customer feedback. Website improvements and profile management are related but separate tasks. We do not create fake locations or reviews to make a business appear more established.',
        ],
      },
      {
        heading: 'Use evidence to assess progress',
        paragraphs: [
          'SEO results depend on competition, website condition, content and the wider search environment. Meaningful progress can take months, and there is no reliable promise that every update will produce a ranking increase. A sensible plan defines what will be measured before setting expectations.',
          'With authorised Search Console access, review the queries and pages receiving impressions and clicks. Combine that with enquiry quality and website behaviour, where measurement is configured, to decide what deserves further work. Changes should be documented so the business can understand the relationship between the work completed and the outcomes observed.',
        ],
      },
      {
        heading: 'Prepare for an SEO consultation',
        paragraphs: [
          'Share your website URL, main services, actual service areas and the business outcomes you want to improve. If you have an existing SEO arrangement, tell us which changes have already been made and which account reports you can share safely.',
          'Our office is in Noida; Greater Noida and Greater Noida West businesses can contact us to discuss project fit and availability. We can then separate technical priorities from content and ongoing marketing requirements instead of treating them as one undifferentiated package.',
        ],
      },
    ],
    related: ['website-development-greater-noida', 'digital-marketing-greater-noida', 'contact-us'],
  },
  {
    slug: 'meta-ads-agency-greater-noida',
    title: 'Meta Ads Management in Greater Noida | Websynk',
    description: 'Plan Facebook and Instagram advertising with Websynk. Discuss Meta campaign setup, audience targeting, creative, lead journeys, optimisation and reporting.',
    heading: 'Meta Ads management for Greater Noida businesses.',
    eyebrow: 'FACEBOOK & INSTAGRAM ADVERTISING',
    introduction: 'Websynk Technologies provides Meta Ads services for businesses in Greater Noida and Noida, connecting campaign setup, audience planning, creative requirements and reporting with a clear business objective.',
    serviceType: 'Meta Ads management',
    sections: [
      {
        heading: 'Begin with the offer and audience',
        paragraphs: ['A useful campaign brief explains who the offer is for and why it matters to them. Before choosing an image or video, identify the product or service, its relevant service area and the action you want someone to take. A message aimed at an appointment enquiry needs a different journey from a catalogue promotion.', 'Share your brand material, existing website and any authorised campaign history. We use the discussion to define the initial scope and understand what content, account access and approvals will be needed. We do not assume that a business needs every available campaign format.'],
      },
      {
        heading: 'Connect creative with the destination',
        paragraphs: ['An advert makes a promise that the next page or conversation needs to explain. The headline, visual and call to action should work with the landing page, enquiry form or contact route. If someone clicks for a specific service, the destination should make that service easy to understand.', 'We discuss creative production, supplied assets and approval responsibilities as part of the proposal. The same applies to the enquiry journey: whether an approved platform form, a website page or WhatsApp is appropriate depends on the campaign requirements and how your team will respond.'],
        bullets: ['Campaign objectives and initial setup', 'Audience and geographic targeting', 'Creative and message planning', 'Landing page or enquiry journey review', 'Campaign optimisation and agreed reporting'],
      },
      {
        heading: 'Make account ownership and budgets clear',
        paragraphs: ['Your business should understand which advertising accounts and assets are being used and who owns them. Access is granted through suitable account permissions rather than shared passwords in public documents. Any website tracking or platform integration also needs an agreed data-handling approach.', 'Advertising spend is separate from agency service fees unless an agreement explicitly says otherwise. The proposal should define the working budget, approval process and which activities are included. A campaign should not begin with unclear expectations about spend or responsibility.'],
      },
      {
        heading: 'Review performance in context',
        paragraphs: ['Reporting should explain the activity observed and relate it to the agreed objective. Clicks and platform enquiries do not automatically equal qualified customers or sales. Your team’s feedback on enquiry relevance helps make campaign reporting more useful.', 'Optimisation can involve reviewing audiences, messages, creative and the destination journey. The scope and review cadence are confirmed for the engagement. We do not guarantee a fixed cost per lead or a number of sales, because outcomes also depend on the offer, market, budget and customer response.'],
      },
      {
        heading: 'Discuss your Greater Noida campaign',
        paragraphs: ['Our physical office is in Sector 142, Noida. We work with enquiries from Greater Noida, Greater Noida West and surrounding Delhi NCR areas. Tell us where your customers are and which services you want to promote so targeting and delivery requirements can be considered.', 'For the first conversation, prepare a brief description of your business, the offer, your website and your planned timing. We can then discuss Meta Ads as part of a suitable scope, or identify whether the website and enquiry process need attention before advertising begins.'],
      },
    ],
    related: ['digital-marketing-greater-noida', 'google-ads-agency-greater-noida', 'contact-us'],
  },
  {
    slug: 'google-ads-agency-greater-noida',
    title: 'Google Ads Management in Greater Noida | Websynk',
    description: 'Discuss Google Ads campaigns with Websynk: search intent, keyword planning, campaign setup, relevant landing pages, budget responsibilities and performance reporting.',
    heading: 'Google Ads for Greater Noida, built around search intent.',
    eyebrow: 'GOOGLE ADS MANAGEMENT',
    introduction: 'Websynk Technologies provides Google Ads services for businesses in Greater Noida and Noida. We connect campaign planning with the service being promoted, the customer’s search intent and the website journey that follows the click.',
    serviceType: 'Google Ads management',
    sections: [
      {
        heading: 'Clarify the service and the search',
        paragraphs: ['A paid search campaign needs a defined offer. Someone looking for a specific local service may need different information from someone comparing general options. Begin by listing the services you want to promote, the actual areas you serve and which enquiries your team can handle.', 'Keyword research should be connected to that brief. The aim is to investigate relevant intent, not to collect every term that sounds related. Search volume, competition and forecasts require actual account or research data; they should not be invented as part of a proposal.'],
      },
      {
        heading: 'Send visitors to a page that answers the advert',
        paragraphs: ['The destination page should explain the same service as the advert. Clear headings, useful scope information, accurate business details and a suitable enquiry action help visitors decide what to do next. A broad homepage is not always the right destination for every campaign.', 'We review the available landing pages and discuss any work needed before launch. Content, design, form behaviour and mobile usability can affect the journey after a click. Advertising and website responsibilities should therefore be considered together when defining the scope.'],
        bullets: ['Search campaign planning and setup', 'Keyword and geographic targeting', 'Advert messaging and landing page alignment', 'Budget and account access planning', 'Campaign optimisation and performance reporting'],
      },
      {
        heading: 'Define spend, access and measurement',
        paragraphs: ['The business should understand who owns the advertising account, how permissions are granted and which payment arrangements apply. Campaign spend and service fees are separate responsibilities unless the agreement states otherwise. Provider subscriptions or related tools may also have their own costs.', 'Before adding tracking, agree which actions matter and how they will be handled. Phone clicks, WhatsApp clicks and website enquiry events can indicate interest, but a useful report also considers whether the resulting conversations were relevant. Website privacy and consent requirements need to be reviewed for the actual setup.'],
      },
      {
        heading: 'Optimise with evidence rather than guarantees',
        paragraphs: ['Campaign review can examine the queries attracting attention, advert messages, geographic relevance and the destination journey. The work should connect observations with specific changes to investigate. A rise in clicks alone does not establish that a campaign is producing better business outcomes.', 'We do not guarantee a fixed number of leads, a cost per acquisition or a return on advertising spend. Results depend on the market, offer, budget and the business’s ability to respond to customers. Google advertising is also separate from organic SEO and does not purchase higher organic rankings.'],
      },
      {
        heading: 'Prepare a useful campaign brief',
        paragraphs: ['Share your website URL, main services, service area, planned timing and any authorised campaign reports. Explain what counts as a suitable enquiry and who will follow up. If you have already advertised, describe which outcomes you could and could not measure.', 'Our office is in Sector 142, Noida, with services available to Greater Noida and surrounding areas as agreed. Contact us for an initial discussion so campaign platforms, setup, reporting and budget responsibilities can be defined before work begins.'],
      },
    ],
    related: ['digital-marketing-greater-noida', 'seo-services-greater-noida', 'contact-us'],
  },
  {
    slug: 'ecommerce-website-development',
    title: 'E-commerce Website Development in Noida | Websynk',
    description: 'Plan an online store with Websynk: product information, navigation, mobile shopping, checkout requirements and launch preparation for your e-commerce business.',
    heading: 'An online store built for the whole shopping journey.',
    eyebrow: 'E-COMMERCE WEBSITE DEVELOPMENT',
    introduction: 'A good store helps shoppers find the right product, understand the details and complete their next step with confidence. Websynk Technologies develops e-commerce experiences around your catalogue, operations and business requirements.',
    serviceType: 'E-commerce website development',
    sections: [
      {
        heading: 'Plan the catalogue before the storefront',
        paragraphs: [
          'Product count alone does not define an e-commerce project. Variants, categories, stock information, product images and the way people compare items all influence the work involved. A small catalogue with configurable products can need more careful planning than a larger catalogue of straightforward items.',
          'Prepare a sample of your product information before requesting a quotation. Include names, descriptions, prices, variants, categories and image availability. Discuss who will clean, upload and maintain this information so content work is not mistaken for an automatic part of a development estimate.',
        ],
      },
      {
        heading: 'Help customers move from discovery to decision',
        paragraphs: [
          'Navigation and search should reflect how your customers think about the products. Useful filters, descriptive categories and readable product pages can reduce the effort needed to compare options. The mobile experience deserves particular attention because limited space makes confusing menus and unclear actions more noticeable.',
          'A product page needs accurate descriptions, suitable imagery and clear information about what happens next. Delivery, returns and customer-service policies must come from your business; a web developer should not invent them to fill a template. We plan the interface around the information you can support.',
        ],
        bullets: ['Responsive catalogue and product pages', 'Category structure and product discovery', 'Cart and checkout requirements', 'Customer-account features where agreed', 'Business policy and contact information placement'],
      },
      {
        heading: 'Make payment and fulfilment requirements explicit',
        paragraphs: [
          'Payment gateways, delivery services, tax settings and stock systems can involve separate accounts and provider approvals. Identify these requirements early and confirm which integrations are included. Credentials should be shared through an appropriate secure process, not pasted into public project files.',
          'The development proposal should distinguish website work from provider fees, subscriptions and operational responsibilities. If you need inventory synchronisation, multiple fulfilment locations or a specialist order flow, explain it before the scope is approved.',
        ],
      },
      {
        heading: 'Prepare search-friendly product information',
        paragraphs: [
          'A clear category structure, descriptive product content and sensible internal links help visitors navigate the store. Product URLs, metadata and any structured data should reflect the actual catalogue. Publishing ratings, stock levels or promotional prices that the business cannot maintain creates confusion rather than trust.',
          'E-commerce SEO also depends on ongoing catalogue decisions. Out-of-stock items, discontinued products and changing categories need a consistent approach. Discuss how these situations will be handled and who will update the content after launch.',
        ],
      },
      {
        heading: 'Test the complete purchase journey',
        paragraphs: [
          'Before launch, test product selection, variants, basket behaviour and the agreed checkout flow on mobile and desktop. Confirm what messages customers receive and how the business will notice and process an order. Testing should use the payment provider’s supported test mode where available.',
          'For an initial consultation, share your product range, existing store if any, required integrations and launch priorities. Businesses in Noida, Greater Noida and surrounding areas can contact our Sector 142 office to discuss the right scope.',
        ],
      },
    ],
    related: ['website-development-greater-noida', 'digital-marketing-greater-noida', 'contact-us'],
  },
  {
    slug: 'app-development',
    title: 'App Development & Mobile Product Planning | Websynk',
    description: 'Turn a product idea into a clear mobile app brief. Discuss Android, iOS, user journeys, integrations, testing and launch responsibilities with Websynk Technologies.',
    heading: 'Make your app idea a practical product plan.',
    eyebrow: 'APP DEVELOPMENT',
    introduction: 'A successful product starts with a clear understanding of the problem it solves. Websynk Technologies brings design and app development together to help businesses plan mobile experiences around real user needs.',
    serviceType: 'App development',
    sections: [
      {
        heading: 'Define the first useful version',
        paragraphs: [
          'An app brief does not need to begin with every feature you might eventually want. Start with the main user, the problem they face and the action the app should make easier. Describe what people do today and which part of that process needs to improve.',
          'Separating essential functions from later ideas makes scope, cost and approvals easier to discuss. A first version can then be designed around a complete, useful journey rather than a collection of disconnected screens. The priorities should come from business and user needs, not only from a competitor’s feature list.',
        ],
      },
      {
        heading: 'Plan screens as part of a connected experience',
        paragraphs: [
          'Registration, navigation, notifications and error messages all influence whether an app feels understandable. We consider the sequence of interactions as well as the appearance of individual screens. Content, permissions and the information requested from users should have a clear purpose.',
          'Decisions about Android, iOS or a shared approach depend on audience, device needs, integrations and budget. Platform support must be confirmed in the proposal. An app that depends on specialist device features may need different implementation choices from a product focused mainly on content and forms.',
        ],
        bullets: ['User journeys and product requirements', 'Interface design and interactive flows', 'Android and iOS scope assessment', 'API, account and data requirements', 'Testing and release preparation'],
      },
      {
        heading: 'Understand the systems behind the app',
        paragraphs: [
          'Many apps need more than mobile screens. Content management, user accounts, an API, notifications and operational dashboards can be separate parts of the project. Existing business systems and data sources may also require integration work.',
          'Tell us which systems already exist, who owns them and what documented access is available. Hosting, third-party subscriptions, account approvals and future updates should be discussed as part of the operating plan. A feature should not be treated as complete until its dependencies are understood.',
        ],
      },
      {
        heading: 'Test behaviour, not only appearance',
        paragraphs: [
          'A testing plan should cover the agreed user journeys, supported devices, input validation, failure states and recovery from interrupted actions. If an app uses accounts or business data, access rules and data-handling decisions need particular attention.',
          'App store publication may require business-owned developer accounts, review information and provider approval. A development handover should explain who is responsible for these steps and how release issues will be handled. Publication dates cannot be guaranteed solely by finishing the design.',
        ],
      },
      {
        heading: 'Bring a clear brief to your first conversation',
        paragraphs: [
          'Share a short description of the product, who will use it, the most important actions and any existing website or systems. Reference apps are helpful when you explain what works well about them rather than asking for a copy.',
          'We can then discuss project fit, design priorities, development scope and the information needed for a quotation. For businesses in Greater Noida and Noida, our physical office is at Sector 142, Noida; call or send a WhatsApp enquiry to arrange the next step.',
        ],
      },
    ],
    related: ['website-development-greater-noida', 'about-us', 'contact-us'],
  },
  {
    slug: 'about-us',
    title: 'About Websynk Technologies | Digital Solutions in Noida',
    description: 'Meet Websynk Technologies, a Noida-based digital solutions company connecting website development, apps, design, SEO and digital marketing around business goals.',
    heading: 'One connected team. A clearer digital direction.',
    eyebrow: 'ABOUT WEBSYNK TECHNOLOGIES',
    introduction: `Established in ${establishedYear}, Websynk Technologies is a digital solutions company with a physical office in Sector 142, Noida. With ${deliveredProjects} projects delivered, we connect design, development and digital marketing so businesses can plan their next step with a clearer picture.`,
    sections: [
      {
        heading: 'Start with the business behind the brief',
        paragraphs: [
          'Every project begins with a reason for change. You might need a more useful website, a mobile product, a stronger visual identity or a more considered way to reach potential customers. Understanding that reason helps define the work before it becomes a list of features.',
          'Our conversations focus on your audience, priorities and operating requirements. We want to understand what people need from your business and how digital work can support it. This gives design and technology decisions a practical direction rather than treating them as separate exercises.',
        ],
      },
      {
        heading: 'Bring complementary expertise together',
        paragraphs: [
          'Our service areas include website development, app development, digital marketing, SEO and content, branding, interface design and e-commerce. A project can begin with one service or connect several disciplines, depending on its needs and the scope agreed.',
          'A business website, for example, needs more than a set of pages. It needs useful content, understandable navigation, a responsive interface and an enquiry journey. Marketing then needs to connect with the same offer and audience. Looking at these relationships helps reduce gaps between the work people see and the actions they need to take.',
        ],
      },
      {
        heading: 'Make collaboration clear and practical',
        paragraphs: [
          'A good working relationship depends on shared expectations. Scope, content responsibilities, approvals, timelines and access should be discussed before work begins. The same applies to integrations, provider accounts and any requested support after launch.',
          'We value clear communication and considered execution. Rather than promising a one-size-fits-all outcome, we discuss the requirements and explain which decisions need to be made. A written proposal should give both sides a useful reference for what is included and what needs a separate discussion.',
        ],
        bullets: ['Business-focused project planning', 'Responsive experiences and useful content', 'Design and development working in the same direction', 'Clear requirements, access and approval responsibilities', 'A practical conversation before a commitment'],
      },
      {
        heading: 'Based in Noida, open to your next project',
        paragraphs: [
          'Our office address is 603, Advant Navis Business Park, Sector 142, Noida, Uttar Pradesh, India. This is our physical location; Greater Noida and other nearby place names describe project enquiry areas, not additional offices.',
          'We welcome conversations with businesses in Greater Noida, Noida and surrounding Delhi NCR areas. Tell us where you operate and what you need so availability, delivery arrangements and the proposed scope can be confirmed. Call +91 91150 82252 or use our WhatsApp link to begin.',
        ],
      },
      {
        heading: 'Useful information before you contact us',
        paragraphs: [
          'You do not need a finished specification to start a conversation. A short description of your business, the problem you want to solve and any important timing is enough to begin clarifying the brief. If an existing website or app is involved, share its public URL.',
          'For a more detailed estimate, we may need the required pages or screens, integrations, content readiness and the people involved in approvals. This keeps the discussion grounded in your situation. Explore our service pages for practical guidance on what a project brief can include.',
        ],
      },
    ],
    related: ['website-development-greater-noida', 'digital-marketing-greater-noida', 'contact-us'],
  },
  {
    slug: 'contact-us',
    title: 'Contact Websynk Technologies | Sector 142, Noida',
    description: 'Discuss your website, app or digital marketing project with Websynk Technologies. Call +91 91150 82252 or find our office in Sector 142, Noida.',
    heading: 'Your next project starts with a conversation.',
    eyebrow: 'CONTACT WEBSYNK',
    introduction: 'Tell us about your business and what you want to improve. We can discuss the requirements, the next useful step and the information needed to prepare a quotation.',
    sections: [
      {
        heading: 'Visit our Noida office',
        paragraphs: ['603, Advant Navis Business Park, Sector 142, Noida, Uttar Pradesh, India.', 'Please call or send a WhatsApp enquiry before visiting so arrangements can be confirmed. Our physical office is in Noida. Greater Noida, Greater Noida West and surrounding Delhi NCR areas are project enquiry areas, not additional branches.'],
      },
      {
        heading: 'What to include in your enquiry',
        paragraphs: ['A short, specific brief helps us understand how to help. Share only information needed for the conversation; do not include passwords, payment details or other sensitive credentials.'],
        bullets: ['Your business name and main service or product', 'Your existing website or app, if there is one', 'What you need built or improved', 'Your preferred timeline and any fixed requirements', 'The best way to reach you for a discussion'],
      },
      {
        heading: 'Choose the contact route that suits you',
        paragraphs: ['Call +91 91150 82252 for a conversation or open WhatsApp to send a project summary. The website enquiry form prepares a WhatsApp message for you to review and send. Completing the form does not itself send an enquiry or store it in a Websynk website database.', 'A consultation is an initial discussion, not a commitment to a project or a guaranteed result. Project scope, pricing, availability and ongoing responsibilities are confirmed separately.'],
      },
    ],
    related: ['website-development-greater-noida', 'digital-marketing-greater-noida', 'about-us'],
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy & Website Enquiries | Websynk Technologies',
    description: 'How the Websynk website handles enquiry forms, WhatsApp and phone links, external maps, Google Tag Manager and hosting.',
    heading: 'Privacy, explained in plain language.',
    eyebrow: 'WEBSITE PRIVACY',
    introduction: 'This notice describes the website features currently implemented by Websynk Technologies. It explains what happens when you read the site or choose to contact us through its links and enquiry form.',
    sections: [
      {
        heading: 'The website enquiry form',
        paragraphs: ['The form uses the details you enter to prepare a WhatsApp message in your browser. The site does not submit those details to a Websynk form-processing endpoint or store them in a website enquiry database. You review the message and decide whether to send it in WhatsApp.', 'If you send a message or call us, the communication is handled through that service and the business’s normal communication process. Share only what is needed to discuss your project. Do not send passwords, payment-card information or sensitive credentials through the form.'],
      },
      {
        heading: 'External services and links',
        paragraphs: ['WhatsApp links take you to a third-party service. The directions link opens Google Maps. These services may process information under their own policies when you choose to use them. They are links rather than embedded chat or maps widgets on this site.', 'Phone links ask your device to open its calling application. This website does not record your calls. Your device and communications providers may handle information associated with a call.'],
      },
      {
        heading: 'Google Tag Manager and hosting',
        paragraphs: ['This website loads Google Tag Manager using container GTM-P7S6T33L, supplied by the business owner. The tags published in that container determine which measurement or advertising services run. Google Analytics 4 and Google Ads account configurations have not been verified. No separate direct Google Analytics script has been added alongside this container.', 'The website does not intentionally add enquiry names, phone numbers, email addresses or project descriptions to the Tag Manager data layer. Enquiry details are used to prepare the WhatsApp draft described above.', 'The hosting provider may maintain operational request logs for delivery, reliability and security. This website source does not define a retention schedule for those provider-managed logs. The owner should confirm the hosting provider’s actual practices before making more specific commitments.'],
      },
      {
        heading: 'Questions about your information',
        paragraphs: ['If you have a question about information you have shared with Websynk, contact us on +91 91150 82252. Explain the communication concerned without sending additional sensitive information.', 'Our business address is 603, Advant Navis Business Park, Sector 142, Noida, Uttar Pradesh, India. This notice should be reviewed by the business owner whenever contact handling, analytics or website features change. It does not describe processes that have not been supplied or verified.'],
      },
    ],
    related: ['contact-us', 'terms-and-conditions', 'about-us'],
  },
  {
    slug: 'terms-and-conditions',
    title: 'Website Information & Project Enquiries | Websynk',
    description: 'Understand the scope of Websynk website information, initial consultations and project proposals before starting a website or digital marketing enquiry.',
    heading: 'Clear expectations from the first conversation.',
    eyebrow: 'WEBSITE TERMS',
    introduction: 'These terms explain the purpose of the Websynk Technologies website and how its project enquiries work. Project-specific agreements are discussed separately and confirmed in writing.',
    sections: [
      {
        heading: 'Website information',
        paragraphs: ['Service descriptions help you understand the types of work to discuss with us. They are general information, not a fixed quotation or a promise that every feature, platform or delivery date is available for every project.', 'Before committing to a project, confirm the scope, deliverables, responsibilities, pricing and approval process in a written proposal or agreement. Third-party accounts, subscriptions, provider fees and advertising budgets should be addressed explicitly where relevant.'],
      },
      {
        heading: 'Consultations and enquiries',
        paragraphs: ['A free consultation is an initial discussion about your requirements. Sending an enquiry does not create a development or marketing agreement. The website form prepares a WhatsApp draft; it is only sent when you choose to send it through WhatsApp.', 'Please provide accurate contact information and a useful summary of the work you want to discuss. Do not use the enquiry routes to share sensitive credentials or information unrelated to the project conversation.'],
      },
      {
        heading: 'Outcomes and third-party services',
        paragraphs: ['Search rankings, advertising results and business enquiries are influenced by factors outside a website developer’s control. This site does not guarantee a first-page ranking, a fixed return on advertising spend or a particular number of sales.', 'Links to WhatsApp, maps and reference material open services operated by others. A project involving third-party platforms may be subject to those providers’ account requirements, review processes and service availability. Confirm these dependencies during project planning.'],
      },
      {
        heading: 'Contact and updates',
        paragraphs: ['Contact Websynk Technologies on +91 91150 82252 with questions about the website or a project proposal. Our office is at 603, Advant Navis Business Park, Sector 142, Noida, Uttar Pradesh, India.', 'The business owner should review these website terms when services, enquiry handling or commercial processes change. Detailed contractual terms are outside the scope of a general website information page and should be agreed for the actual engagement.'],
      },
    ],
    related: ['contact-us', 'privacy-policy', 'about-us'],
  },
  {
    slug: 'blog',
    title: 'Website & Digital Marketing Guides | Websynk Insights',
    description: 'Practical guides to planning a business website, comparing agency proposals and choosing between SEO and paid advertising. Read Websynk’s digital business insights.',
    heading: 'Useful ideas for your next digital decision.',
    eyebrow: 'WEBSYNK INSIGHTS',
    introduction: 'Clearer questions lead to better project decisions. These guides help business owners plan a website brief, understand quotations and discuss digital marketing without relying on shortcuts or guaranteed-result claims.',
    sections: [],
    related: ['website-development-greater-noida', 'digital-marketing-greater-noida', 'contact-us'],
  },
];

export type BlogArticle = {
  slug: string;
  title: string;
  description: string;
  category: string;
  introduction: string;
  sections: ContentSection[];
  related: string[];
  references?: { label: string; href: string }[];
};

export const blogArticles: BlogArticle[] = [
  {
    slug: 'choosing-a-website-development-company-greater-noida',
    title: 'How to Choose a Website Development Company in Greater Noida',
    description: 'Compare website agencies using a clear brief, meaningful questions and written project scope. A practical selection guide for Greater Noida business owners.',
    category: 'PROJECT PLANNING',
    introduction: 'Choosing an agency is easier when you know what you need to compare. A strong portfolio can begin the conversation, but the right decision also depends on scope, communication, ownership and how the finished website will be used.',
    sections: [
      {
        heading: 'Write down the business problem first',
        paragraphs: ['Before contacting agencies, describe what your current website or process is failing to do. Do visitors struggle to understand the offer? Is the mobile layout difficult to use? Do you need a new service structure, a product catalogue or a more reliable enquiry journey?', 'A short brief can include the target audience, required pages, important features and content readiness. You do not need to prescribe the technology immediately. A useful agency conversation should help translate your business requirements into an appropriate scope.'],
      },
      {
        heading: 'Compare proposals by what is actually included',
        paragraphs: ['Two prices are not directly comparable if they cover different work. Check whether copywriting, product entry, design revisions, integrations and migration are included. Ask who will supply imagery and who will approve the content.', 'Pay particular attention to domain and hosting ownership, administrator access, provider subscriptions and post-launch responsibilities. These details affect how easily your business can operate and update the site after the project ends.'],
        bullets: ['Which pages and features are included?', 'How will mobile layouts be tested?', 'Who owns the domain, hosting and account access?', 'What is the approval and revision process?', 'What support is available, and on what terms?'],
      },
      {
        heading: 'Ask how search and accessibility fit into the build',
        paragraphs: ['Ask whether important content will be available in readable HTML and whether titles, headings, internal links and canonical URLs are part of the scope. A development proposal should separate these foundations from ongoing SEO content and marketing work.', 'Be cautious of guaranteed first-position promises. Google’s guidance explains that no one can guarantee a number-one ranking. Ask instead how the agency identifies issues, documents changes and measures progress where authorised account data is available.'],
        sources: [{ label: 'Google: choosing an SEO provider and realistic expectations', href: 'https://developers.google.com/search/docs/fundamentals/do-i-need-seo' }],
      },
      {
        heading: 'Look for useful communication, not only polished presentation',
        paragraphs: ['A good initial discussion should clarify the problem and identify assumptions. Does the agency ask about your audience and content, explain dependencies and distinguish essential features from later possibilities? Those questions can be more informative than a generic package list.', 'For a Greater Noida business, it is also helpful to confirm how meetings and delivery will work. Verify the actual office address rather than assuming every location mentioned in marketing copy is a physical branch.'],
      },
      {
        heading: 'Agree the next step before making a commitment',
        paragraphs: ['Create a short comparison of scope, exclusions, communication, access and operating costs. If a requirement is important, put it in the written proposal. This gives both sides a reference when priorities change.', 'Websynk Technologies welcomes project enquiries from Greater Noida and Noida. Our physical office is in Sector 142, Noida. Share your website brief with us to discuss project fit and the information needed for a quotation.'],
      },
    ],
    related: ['website-development-greater-noida', 'about-us', 'contact-us'],
    references: [{ label: 'Google Search Central: questions to ask when choosing an SEO provider', href: 'https://developers.google.com/search/docs/fundamentals/do-i-need-seo' }],
  },
  {
    slug: 'website-development-cost-greater-noida',
    title: 'Website Development Cost in Greater Noida: A Scope Guide',
    description: 'Understand the factors behind a website quotation: content, design, features, integrations and support. Prepare a better brief without relying on invented price ranges.',
    category: 'BUDGET & SCOPE',
    introduction: 'There is no useful single price for every business website. A quotation becomes more meaningful when you understand what changes the work involved and which responsibilities sit with your business.',
    sections: [
      {
        heading: 'Page count is only the beginning',
        paragraphs: ['A ten-page brochure website and a ten-page website with accounts, payments and an operational dashboard can require very different work. Reusable content layouts, custom interactions and the complexity of each user journey matter as much as the number of URLs.', 'Start by listing the pages visitors need and the actions they should be able to complete. Separate essential functionality from ideas that can be considered later. This gives an agency a clearer basis for estimating design and development effort.'],
      },
      {
        heading: 'Content readiness changes the project',
        paragraphs: ['Copy, photographs, product information and brand assets need time and approval. If your business already has organised, accurate material, the content process may be simpler than a project that begins with scattered documents and missing product details.', 'Ask whether writing, editing, image sourcing, catalogue entry and content migration are included. These are real tasks. If the proposal assumes the client will supply them, agree the format and timing so the development schedule is not built on missing inputs.'],
      },
      {
        heading: 'Integrations bring dependencies as well as features',
        paragraphs: ['A payment provider, booking tool, CRM or stock system can require account approval, documented access and ongoing subscriptions. The website work is only one part of making the feature available to customers.', 'Clarify which integrations are included and who is responsible for provider fees, account ownership and credentials. A custom connection to an existing business system may require a discovery step before a fixed estimate is possible.'],
        bullets: ['Domain and hosting charges', 'Third-party platform subscriptions', 'Payment or messaging provider fees', 'Content production and catalogue entry', 'Maintenance and future feature work'],
      },
      {
        heading: 'Separate launch work from ongoing operation',
        paragraphs: ['A website needs an agreed handover. Your proposal should explain which access details, editing guidance and testing are included. It should also describe how launch issues will be reported and which changes are outside the original scope.', 'Maintenance, content updates and ongoing SEO are not automatically the same service as building the site. Ask which options are available and confirm the responsibilities in writing rather than assuming unlimited future changes are included.'],
      },
      {
        heading: 'Request a quotation you can compare',
        paragraphs: ['Send the same brief to each agency and ask for a breakdown of deliverables, assumptions and exclusions. If one proposal is significantly cheaper, look for differences in design, content, integrations, testing and support before drawing a conclusion.', 'Websynk Technologies can discuss your requirements and the information needed for a customised quotation. Share your existing website, required pages, key features and timeline. We do not publish an invented universal price range because the scope should come first.'],
      },
    ],
    related: ['website-development-greater-noida', 'ecommerce-website-development', 'contact-us'],
  },
  {
    slug: 'seo-vs-google-ads-for-business',
    title: 'SEO vs Google Ads: Which Fits Your Business Goal?',
    description: 'Understand the different roles of organic search and paid search. Compare intent, website readiness, measurement and realistic expectations before choosing a channel.',
    category: 'DIGITAL MARKETING',
    introduction: 'SEO and paid search can support different parts of a business’s digital strategy. The useful question is not which channel is universally better, but which approach fits your objective, website and ability to measure useful outcomes.',
    sections: [
      {
        heading: 'Understand what each channel changes',
        paragraphs: ['SEO improves how a website can be discovered and understood in organic search. It involves the website’s technical condition, useful content and how its pages relate to the questions people ask. Changes do not produce an automatic ranking increase, and their effects can take time to appear.', 'Google Ads is a separate advertising system. Paying for ads does not improve organic rankings. Treat the two as distinct routes with different planning, account and budget requirements rather than as interchangeable shortcuts.'],
        sources: [{ label: 'Google: SEO starter guide', href: 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide' }, { label: 'Google: advertising and organic results', href: 'https://developers.google.com/search/docs/fundamentals/do-i-need-seo' }],
      },
      {
        heading: 'Start with the customer’s question',
        paragraphs: ['A person searching for a specific service may need a clear offer, evidence they can verify and an easy way to enquire. Someone researching an unfamiliar problem may need a useful guide before they are ready to contact a provider.', 'Map those needs to suitable pages before choosing a channel. A relevant click is less useful if the destination page does not explain the service or makes it difficult to find a contact route. Website readiness is a shared requirement, not an afterthought reserved for one marketing channel.'],
      },
      {
        heading: 'Compare the resources you can maintain',
        paragraphs: ['An SEO plan needs time for technical fixes, content decisions and review. Paid campaigns need an advertising budget as well as setup, suitable landing pages, creative decisions and ongoing monitoring. Both need a person in the business who can approve information and respond to enquiries.', 'For search advertising, location and language settings should reflect the audience you intend to serve. Keyword planning tools can help investigate relevant ideas, but account access and actual data are needed before presenting volumes or forecasts as evidence.'],
      },
      {
        heading: 'Measure business relevance rather than just clicks',
        paragraphs: ['A phone-link click, a WhatsApp click or a form action can indicate interest. It does not prove that a qualified customer enquiry or sale occurred. Decide how your business will record relevance and outcomes before interpreting campaign activity.', 'If owner-authorised analytics and Search Console access are available, use them to review the pages and queries contributing to the journey. Explain uncertainties and avoid making a channel look successful by reporting only the numbers that rose.'],
        bullets: ['What outcome are we trying to support?', 'Which page answers the customer’s need?', 'What resources and budget are available?', 'How will a relevant enquiry be identified?', 'When will the approach be reviewed?'],
      },
      {
        heading: 'Choose a practical starting point',
        paragraphs: ['A business with a weak website may first need to improve the service explanation and enquiry journey. Another may have a clear offer and want to discuss a focused advertising test. The right starting point depends on the situation, not a universal package.', 'Talk to Websynk Technologies about your digital marketing requirements. SEO scope and any requested Google Ads or Meta Ads work should be assessed and confirmed in a written proposal, including platforms, deliverables, reporting and budget responsibilities.'],
      },
    ],
    related: ['seo-services-greater-noida', 'digital-marketing-greater-noida', 'contact-us'],
    references: [
      { label: 'Google Search Central: SEO fundamentals and realistic expectations', href: 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide' },
      { label: 'Google Search Central: advertising does not influence organic rankings', href: 'https://developers.google.com/search/docs/fundamentals/do-i-need-seo' },
      { label: 'Google Ads Help: refine keyword ideas and location settings', href: 'https://support.google.com/google-ads/answer/6325025?hl=en' },
    ],
  },
];

export const publicPage = (slug: string) => publicPages.find(page => page.slug === slug);
export const blogArticle = (slug: string) => blogArticles.find(article => article.slug === slug);
