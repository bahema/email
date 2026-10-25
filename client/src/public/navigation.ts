const homeSections=new Set(['offers','categories','upcoming','faq','reviews']);
/** Global navigation anchors belong to the homepage, even on department/detail pages. */
export function publicNavigationHref(href:string){return href.startsWith('#')&&homeSections.has(href.slice(1))?'/'+href:href;}
