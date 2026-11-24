export type BlogArticleStatus = 'draft' | 'active' | 'inactive';
export type BlogCategoryStatus = 'active' | 'inactive';

export interface BlogSettings {
  enabled: boolean;
  showWhenEmpty: boolean;
  updatedAt: string;
}

export interface BlogCategory {
  id: number;
  title: string;
  slug: string;
  description: string;
  status: BlogCategoryStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface BlogArticle {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  categoryId: number | null;
  author: string;
  status: BlogArticleStatus;
  bodyHtml: string;
  coverMediaId: number | null;
  coverAlt: string;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  productIds: number[];
  relatedArticleIds: number[];
}
