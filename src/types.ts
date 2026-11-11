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
  area?: string; // city / town, used to group places
  country?: string;
  lat?: number;
  lng?: number;
  datetime: string; // ISO local yyyy-mm-ddThh:mm
  cost?: number;
  rating: number; // 0–5
  notes: string;
  dishes: Dish[]; // food log
  tags: string[];
  wouldReturn?: boolean;
  /** Planned = on the itinerary but not done yet. Missing means done. */
  status?: 'planned' | 'done';
  /** Estimated time the stop takes, in minutes (for planning). */
  durationMins?: number;
  /** The planned location (leg) this stop belongs to. */
  legId?: string;
  createdAt: number;
  updatedAt: number;
}

export type TravelMode = 'flight' | 'train' | 'car' | 'bus' | 'ferry' | 'walk' | 'other';

export const TRAVEL_MODES: { id: TravelMode; label: string }[] = [
  { id: 'flight', label: 'Flight' },
  { id: 'train', label: 'Train' },
  { id: 'car', label: 'Drive' },
  { id: 'bus', label: 'Bus' },
  { id: 'ferry', label: 'Ferry' },
  { id: 'walk', label: 'Walk' },
  { id: 'other', label: 'Other' },
];

/** A planned location on the itinerary, with the number of days spent there. */
export interface Leg {
  id: string;
  tripId: string;
  order: number;
  name: string; // e.g. "Kyoto"
  country?: string;
  lat?: number;
  lng?: number;
  days: number; // days allocated to this location
  /** How you get here from the previous location (ignored for the first). */
  travelMode?: TravelMode;
  /** Whole days spent travelling to get here (0 = travel on the arrival day). */
  travelDays: number;
  travelNotes?: string;
  notes: string;
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
