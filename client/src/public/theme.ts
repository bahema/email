import type {CSSProperties} from 'react';
import type {WebsiteSections} from '@affiliate/shared';
export function publicThemeStyle(theme:WebsiteSections['theme']):CSSProperties{return{'--site-nav-bg':theme.navBackground||'#1b283b','--site-nav-text':theme.navText||'#f8fafc','--catalog-bg':theme.catalogBackground||'#e8edf1','--catalog-action':theme.catalogAction||'#f2c75c','--catalog-action-text':theme.catalogActionText||'#1b283b','--primary':theme.primary,'--secondary':theme.secondary,'--accent':theme.accent,'--site-background':theme.background} as CSSProperties;}
