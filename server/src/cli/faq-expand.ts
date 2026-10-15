// Add useful visitor questions without replacing owner-edited FAQ content.
import { config } from '../config.js';
import { openDatabase } from '../db/database.js';
import { SettingsStore } from '../settings/store.js';
import { ContentStore } from '../content/store.js';
const questions=[
 ['browse-account','Do I need an account to browse resources?','No. You can browse categories and read product details without an account. Some guides, updates or offers have an email signup form. The Admin login is for the website owner.'],
 ['choose-resource','How can I find a resource that suits my needs?','Use the search box and category filters in the Resource library. Open Details to review the description, intended audience, included features and limitations where provided. Check the provider’s current information before making a purchase.'],
 ['buy-provider','Where do I purchase an item, and who handles payments?','Affiliate links take you to a third-party provider. That provider handles checkout, payment, delivery and its own terms. This website does not process your purchase.'],
 ['current-offers','Are prices and availability guaranteed?','No. Providers can change prices, availability, eligibility and offer terms. Verify those details on the provider’s website, including any restrictions for your country, before buying or signing up.'],
 ['confirm-reason','Why do I need to confirm my email address?','Confirmation verifies that you control the email address and completes signup. Open the confirmation email and select Confirm subscription on the linked page. Do not confirm a signup you did not request.'],
 ['missing-confirmation','What should I do if the confirmation email does not arrive?','Check your spam or junk folder and make sure you entered the correct address. Delivery can take time. The confirmation page has a Need another confirmation email? option. If the issue continues, use the contact details published in the footer when available.'],
 ['after-confirmation','What happens after I confirm a resource signup?','The next step depends on the page you joined. It may provide a resource download, access instructions or a related offer email, followed by optional campaign updates. Email delivery depends on the sender configuration and your email provider.'],
 ['protected-download','Why does a download link stop working?','Some resources use private, time-limited links and require a confirmed subscription. A link can become unavailable after expiry or unsubscribe. Return to the original signup page or contact the website owner using the published contact details for help.'],
 ['cookie-use','Does this website use advertising cookies or social trackers?','Browser advertising cookies, browser analytics and embedded social trackers are not enabled. Owner login uses a session cookie, and the cookie notice is remembered only if you choose to save it. Open Cookies & privacy to see details or remove the saved notice preference. The privacy policy also explains server activity and email tracking.'],
 ['refund-support','Who should I contact about a purchase, refund or product problem?','Contact the provider that sold you the item and follow its support and refund terms. For questions about this website, a signup or resource access, use the website contact information in the footer when published. Never send passwords or payment-card details.'],
] as const;
if(!config.SETTINGS_ENCRYPTION_KEY)throw new Error('Server security setup is required');
const db=openDatabase(config.databasePath);
try{
 const store=new ContentStore(db,new SettingsStore(db,config.SETTINGS_ENCRYPTION_KEY,config.SITE_URL,config.TIMEZONE));
 const existing=store.items(),slugs=new Set(existing.filter(i=>i.kind==='faq').map(i=>i.slug));let position=Math.max(0,...existing.filter(i=>i.kind==='faq').map(i=>i.position))+1,added=0;
 for(const [slug,question,answer] of questions){if(slugs.has(slug))continue;store.saveItem({kind:'faq',slug,title:question,position:position++,status:'active',data:{question,answer}});added++;}
 console.info(`Added ${added} visitor FAQs. Existing questions were preserved. No contacts or email campaigns were changed.`);
}finally{db.close();}
