
export interface CreatorProfile {
  name: string;
  age: string;
  gender: string;
  ugcFormat: string; // Short-form Video, Static Image, Long-form Review, etc.
}

export interface BrandPreference {
  targetType: 'D2C' | 'B2B' | 'Both';
  niche: string;
}

export interface FollowUpLog {
  date: string;
  type: 'email' | 'video' | 'mixed';
  note?: string;
}

export interface ProductLead {
  id: string;
  name: string;
  tagline: string;
  website: string;
  description: string;
  industry: string;
  targetType?: 'B2B' | 'D2C'; // Added to support filtering
  contactName?: string;
  contactNameSource?: string;
  contactEmail?: string;
  generatedEmail?: string;
  followUpEmail?: string; // Specific draft for follow-ups
  followUpAssetUrl?: string; // URL for the generated GIF/Video
  status: 'new' | 'investigating' | 'ready' | 'contacted';
  contactedAt?: string; // New: tracking outreach date
  isArchived?: boolean; // If true, hidden from primary views
  sourceUrl: string;
  isPhVerified: boolean;
  isActive: boolean;
  followUpLogs?: FollowUpLog[];
}

export interface SearchResult {
  products: ProductLead[];
  groundingSources: any[];
}

export enum PitchTemplate {
  UNBOXING = 'Unboxing/Product Demo',
  TESTIMONIAL = 'Authentic Testimonial',
  TRENDING = 'Trending Hook/Viral Style',
  PROBLEM_SOLUTION = 'Problem/Solution Narrative'
}
