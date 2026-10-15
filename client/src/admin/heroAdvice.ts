import type {HeaderSlide} from '@affiliate/shared';
export function heroAdvice(s:HeaderSlide,layout:string){const a:string[]=[];
 if(!s.headline.trim())a.push('State one clear benefit in the headline.');
 if(!s.description.trim())a.push('Explain who this offer helps and what happens next.');
 if(!s.benefits.length)a.push('Add a few specific, factual benefits.');
 if(s.action==='none')a.push('Choose a primary action if this header should drive clicks or signups.');
 if(s.action!=='none'&&!s.ctaLabel.trim())a.push('Use a specific primary button label.');
 if(s.action==='lead_capture'&&!s.signup.leadPageId)a.push('Connect an active signup funnel for this promotion’s related email or resource.');
 if(s.action==='affiliate'&&!s.offerId)a.push('Select a published affiliate offer.');
 if(s.action!=='lead_capture'&&s.signup.display==='inline')a.push('Inline signup is ignored for this action. Choose Subscribe to display the form.');
 if(layout==='video'&&!s.videoId&&!s.videoUrl)a.push('Choose an uploaded video or a supported video link.');
 if(layout==='video')a.push('Include a written video summary and ensure your video has captions.');
 if(layout==='event'&&!s.eventAt)a.push('Add the actual event date, timezone and access information.');
 if(s.secondaryLabel&&s.secondaryDestination)a.push('Keep the secondary action only if it helps the same visitor goal.');
 if(layout==='collection')a.push('Keep the collection small and group offers around one clear need.');
 return a;}
