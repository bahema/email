export * from './video.js';
export * from './hero.js';
export interface HealthResponse {
  status: 'ok';
  service: string;
  database: 'connected';
  schemaVersion: number;
}

export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string };
}

export interface SessionResponse {
  authenticated: boolean;
  setupRequired: boolean;
  csrfToken: string;
  expiresAt: string;
  admin: { email: string } | null;
}

export interface GeneralSettings {
  siteName: string; siteUrl: string; adminEmail: string; timezone: string;
  logoUrl: string; defaultSenderName: string;
}
export interface SmtpSettings {
  host: string; port: number; encryption: 'tls' | 'starttls' | 'none';
  username: string; fromName: string; fromEmail: string; replyTo: string;
  passwordSet: boolean; maxPerHour?:number; maxPerMinute?:number;
}
export interface EmailDefaultsSettings {
  headerBackground?: string;
  footer: string; unsubscribeText: string; affiliateDisclosure: string; identity: string; address?:string;contactEmail?:string;contactPhone?:string;websiteDescription?:string;socialLinks?:{platform:string;url:string;iconUrl:string}[];
}
export interface TrackingSettings {
  opens: boolean; emailClicks: boolean; affiliateClicks: boolean; utm: boolean;
}
export interface DomainsSettings { publicUrl: string; dkimSelector?:string; }
export interface ComplianceSettings {
  doubleOptIn: boolean; privacyUrl: string; termsUrl: string;
  affiliateDisclosureUrl: string; consentText: string; unsubscribeFooter: string;
}
export interface AffiliateSettings { disclosure: string; }
export interface UploadSettings { allowedExtensions: string[]; maxSizeMb: number; }
export interface ActivitySettings {enabled:boolean;showLocations:boolean;days:number;intervalSeconds:number;}
export interface SettingsResponse {
  activity:ActivitySettings;
  general: GeneralSettings; smtp: SmtpSettings; emailDefaults: EmailDefaultsSettings;
  tracking: TrackingSettings; domains: DomainsSettings;
  compliance: ComplianceSettings; affiliate: AffiliateSettings; uploads: UploadSettings;
}
export type SettingsSection = keyof SettingsResponse;
export interface SystemResponse {
  schemaVersion: number; database: 'connected'; uptimeSeconds: number;
  runtime: string; environment: string; activeSessions: number;
  sessionHours: number; secureCookies: boolean; worker: 'running' | 'stopped' | 'not_installed';
  emailQueue: 'transactional' | 'marketing_and_transactional' | 'not_installed'; outboxPending: number; outboxFailed: number; smtpConfigured: boolean; encryptionConfigured: boolean;
  marketingWorker: 'running' | 'stopped'; marketingPending: number; marketingFailed: number;
}

export type ContentKind = 'navigation' | 'hero' | 'offer' | 'upcoming' | 'faq' | 'review' | 'partner';
export interface ContentItem { id: number; kind: ContentKind; slug: string; title: string; position: number; status: string; data: Record<string, unknown>; }
export interface MediaAsset { id: number; filename: string; mime: string; size: number; extension: string; category: string; visibility: 'public' | 'private'; url: string; uploadedAt: string; }
export interface WebsiteSections {
  discovery?:{savedEnabled:boolean;compareEnabled:boolean;savedHeading:string;collectionsHeading:string;guidesHeading:string};
  presentation: { heroEyebrow:string; heroSecondaryLabel:string; heroSecondaryHref:string; offersHeadline:string; offersDescription:string; upcomingHeadline:string; upcomingDescription:string; faqHeadline:string; reviewsHeadline:string; footerEyebrow:string };
  homepage: { activeHeroId: number | null; featuredOfferId?:number|null; featuredLeadPageId?:number|null };
  footer: { address?:string; hours?:string; helpfulText?:string; socialLinks?:{platform:string;url:string}[]; description: string; contactEmail: string; contactPhone: string; copyright: string; links: { label: string; href: string }[]; logoId: number | null };
  theme: {navBackground?:string;navText?:string;catalogBackground?:string;catalogAction?:string;catalogActionText?:string; primary: string; secondary: string; accent: string; background: string };
  legal: { privacy: string; terms: string; disclosure: string };
  signup: { headline: string; description: string; confirmationSubject: string; confirmationBody: string; successHeadline: string; successMessage: string; returnLabel: string; returnUrl: string };
}
export interface EditorialPage {id:number;kind:'collection'|'guide';slug:string;title:string;status:'draft'|'active'|'inactive';position:number;createdAt:string;updatedAt:string;data:{description:string;body:string;category:string;imageId:number|null;productIds:number[];guideIds:number[];leadPageId:number|null;featured:boolean;seoTitle:string;seoDescription:string};}
export interface SiteResponse {
  editorial?:EditorialPage[];
  name: string; logoUrl: string; disclosure: string; consentText: string;
  items: ContentItem[]; sections: WebsiteSections;
  leadPages?:{id:number;slug:string;type:string;headline:string;description:string;cta:string;imageId:number|null;hasResource:boolean}[];
}
export type ContactStatus = 'pending' | 'confirmed' | 'unsubscribed' | 'bounced' | 'complained' | 'suppressed';
export interface Contact {
  id: number; name: string; email: string; country: string; continent: string; status: ContactStatus;
  source_type: string; source_id: string; source_label: string; created_at: string;
  consent_mode?:'double'|'single';email_verified_at?:string|null;confirmed_at: string | null; unsubscribed_at: string | null; last_open_at: string | null; last_click_at: string | null;
  tags: { id: number; name: string }[];
}
export interface CountryOption { code: string; name: string; continent: string; }
export interface Newsletter {workspace?:'newsletter'|'campaign';archived_at?:string|null;id:number;title:string;subject:string;preheader:string;html:string;status:'draft'|'ready';created_at?:string;updated_at?:string;}
export interface SegmentRule {field:'status'|'country'|'continent'|'source_type'|'source_id'|'tag'|'created_at'|'confirmed_at'|'opened_within'|'clicked_within'|'campaign_opened'|'campaign_clicked';operator:'eq'|'neq'|'in'|'before'|'after'|'within';value:string;}
export interface Segment {id:number;name:string;mode:'and'|'or';rules:SegmentRule[];}
export type CampaignAudience={type:'continents';continents:string[]}|{type:'all'}|{type:'segment';segmentId:number}|{type:'contacts';contactIds:number[]};
export interface Campaign {lead_submission_id?:number|null;id:number;name:string;newsletter_id:number;audience:CampaignAudience;status:'draft'|'scheduled'|'sending'|'sent'|'paused'|'failed'|'cancelled';scheduled_at:number|null;resolved_at:string|null;completed_at:string|null;counts:{status:string;count:number}[];}

export interface LeadPageSection {videoUrl?:string;videoAutoplay?:boolean;kind:'benefits'|'faq'|'comparison'|'story'|'terms'|'image'|'video'|'products'|'cta'|'testimonials'|'logos'|'form';key?:string;hidden?:boolean;mediaId?:number|null;offerIds?:number[];href?:string;label?:string;title:string;body:string;rows:{label:string;value:string;detail:string}[];}
  export interface LeadPageQuestion {key:string;label:string;required:boolean;options:string[];}
export interface LeadPage {id:number;name:string;slug:string;type:string;status:'draft'|'active'|'inactive';updatedAt?:string;hasUnpublishedChanges?:boolean;data:{downloadPageId?:number|null;deliveryMode?:'double'|'single'|'browse'|'campaign';productIds?:number[];formPlacement?:'side'|'bottom';brandMode?:'compact'|'full';hideHeroMedia?:boolean;colors?:{primary:string;accent:string;background:string};seo?:{title:string;description:string;imageId:number|null;noindex:boolean};audienceSegmentId?:number|null;directNewsletterId?:number|null;sections?:LeadPageSection[];eventAt?:string;endsAt?:string;eventLocation?:string;formMode?:'single'|'steps';calculator?:'roi'|'savings';recommendations?:{questionKey:string;answer:string;offerId:number;message:string}[];layout?:'showcase'|'focused'|'editorial';headline:string;subheadline:string;description:string;body:string;cta:string;imageId:number|null;videoId:number|null;videoUrl?:string;videoAutoplay?:boolean;resourceId:number|null;automationId:number|null;tags:string[];confirmationSubject:string;confirmationBody:string;successHeadline:string;successMessage:string;returnLabel:string;returnUrl:string;offerId:number|null;questions:LeadPageQuestion[];};}
export interface Automation {id:number;name:string;status:'running'|'paused';steps:{delayMinutes:number;newsletterId:number;tags?:string[]}[];}

export interface EmailReadiness { configured:boolean; previewPaused:boolean; trustedAdminOrigin:string; connectionTest:{at:string|null;current:boolean}; sendTest:{at:string|null;current:boolean}; checks:{key:string;label:string;ok:boolean;detail:string;section:string}[]; history:{id:number;at:string;section:string;fields:string[]}[]; }

export interface DownloadPage {id:number;title:string;description:string;instructions:string;buttonLabel:string;mediaId:number;imageId:number|null;status:"draft"|"active";filename?:string;mime?:string;size?:number;updatedAt?:string;}
