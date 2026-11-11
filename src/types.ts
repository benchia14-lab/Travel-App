export type Category =
  | 'food'
  | 'activity'
  | 'attraction'
  | 'stay'
  | 'shopping'
  | 'transport'
  | 'moment';

export interface Trip {
  id: string;
  title: string;
  destination: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  currency: string; // ISO 4217
  budget?: number;
  rating: number; // 0–5, overall trip rating
  notes: string;
  coverMediaId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Dish {
  name: string;
  price?: number;
  rating?: number;
}

export interface Entry {
  id: string;
  tripId: string;
  category: Category;
  title: string;
  placeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  datetime: string; // ISO local yyyy-mm-ddThh:mm
  cost?: number;
  rating: number; // 0–5
  notes: string;
  dishes: Dish[]; // food log
  tags: string[];
  wouldReturn?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Media {
  id: string;
  tripId: string;
  entryId?: string;
  kind: 'image' | 'video';
  blob: Blob; // display-sized image or original video
  thumb: Blob; // ~480px jpeg
  width?: number;
  height?: number;
  lat?: number;
  lng?: number;
  takenAt?: string; // ISO local
  fileName: string;
  createdAt: number;
}

export const CATEGORIES: { id: Category; label: string; plural: string; color: string }[] = [
  { id: 'food', label: 'Food & Drink', plural: 'Food log', color: '#C0623B' },
  { id: 'attraction', label: 'Attraction', plural: 'Attractions', color: '#3D6B8C' },
  { id: 'activity', label: 'Activity', plural: 'Activities', color: '#4E7D5B' },
  { id: 'stay', label: 'Stay', plural: 'Stays', color: '#7A5C99' },
  { id: 'shopping', label: 'Shopping', plural: 'Shopping', color: '#B08A2E' },
  { id: 'transport', label: 'Transport', plural: 'Transport', color: '#5F6670' },
  { id: 'moment', label: 'Moment', plural: 'Moments', color: '#A04A6A' },
];

export const categoryMeta = (c: Category) => CATEGORIES.find((x) => x.id === c) ?? CATEGORIES[6];
