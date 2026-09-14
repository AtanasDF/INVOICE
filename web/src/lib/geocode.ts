import { CATEGORIES, type Category } from "./categories";

type MapboxReverseFeature = {
  properties: {
    feature_type: string;
    name?: string;
    poi_category_ids?: string[];
  };
};

type MapboxReverseResponse = {
  features: MapboxReverseFeature[];
};

export type LocationGuess = {
  vendorName: string | null;
  category: Category | null;
};

const CATEGORY_KEYWORDS: Array<{ category: Category; keywords: string[] }> = [
  { category: "Fuel", keywords: ["gas_station", "fuel", "petrol", "charging_station"] },
  {
    category: "Meals",
    keywords: ["restaurant", "cafe", "coffee", "fast_food", "food", "bakery", "bar", "pub"],
  },
  {
    category: "Travel",
    keywords: [
      "hotel", "lodging", "airport", "train_station", "bus_station", "transit",
      "parking", "car_rental", "taxi", "ferry",
    ],
  },
  {
    category: "Equipment",
    keywords: ["hardware_store", "electronics_store", "office_supply_store", "home_improvement_store"],
  },
  {
    category: "Supplies",
    keywords: ["grocery", "supermarket", "convenience_store", "shop", "store", "market", "pharmacy"],
  },
];

function guessCategory(categoryIds: string[]): Category | null {
  const haystack = categoryIds.join(" ").toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw))) return category;
  }
  return null;
}

/**
 * Reverse-geocodes a GPS point to a nearby point of interest using Mapbox's
 * Search Box API, and guesses which of the app's expense categories it
 * matches. Returns nulls (never throws) when there's no useful signal, so
 * callers can fall back to their own default rather than handling errors.
 */
export async function guessLocationContext(lat: number, lon: number): Promise<LocationGuess> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return { vendorName: null, category: null };

  try {
    const url = new URL("https://api.mapbox.com/search/searchbox/v1/reverse");
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("access_token", token);

    const res = await fetch(url.toString());
    if (!res.ok) return { vendorName: null, category: null };

    const data = (await res.json()) as MapboxReverseResponse;
    const poi = data.features.find((f) => f.properties.feature_type === "poi");
    if (!poi) return { vendorName: null, category: null };

    const categoryIds = poi.properties.poi_category_ids ?? [];
    return {
      vendorName: poi.properties.name ?? null,
      category: guessCategory(categoryIds),
    };
  } catch {
    return { vendorName: null, category: null };
  }
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location isn't available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
    });
  });
}

export { CATEGORIES };
