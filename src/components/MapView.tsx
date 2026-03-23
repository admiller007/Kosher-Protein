import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Package, MapPin, Globe, Building2, ShieldCheck } from 'lucide-react';

// Fix Leaflet marker icons using CDN URLs to avoid build issues
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface Product {
  agencyUniqueId: string;
  productName: string;
  company: string;
  brandName: string;
  dpm: string;
  symbol: string;
  category: string;
  certifiedSince: string;
  location?: string;
  website?: string;
}

interface MapViewProps {
  products: Product[];
}

interface GeocodedProduct extends Product {
  lat: number;
  lng: number;
}

// Simple geocoding cache to avoid redundant calls
const geocodeCache: Record<string, { lat: number, lng: number }> = {
  "Frostburg, MD": { lat: 39.6581, lng: -78.9289 },
  "New York, NY": { lat: 40.7128, lng: -74.0060 },
  "Chicago, IL": { lat: 41.8781, lng: -87.6298 },
  "Los Angeles, CA": { lat: 34.0522, lng: -118.2437 },
  "Brooklyn, NY": { lat: 40.6782, lng: -73.9442 },
  "Lakewood, NJ": { lat: 40.0956, lng: -74.2221 },
  "Monsey, NY": { lat: 41.1157, lng: -74.0618 },
  "Passaic, NJ": { lat: 40.8568, lng: -74.1285 },
  "Baltimore, MD": { lat: 39.2904, lng: -76.6122 },
  "Philadelphia, PA": { lat: 39.9526, lng: -75.1652 },
  "Miami, FL": { lat: 25.7617, lng: -80.1918 },
  "Toronto, ON": { lat: 43.6532, lng: -79.3832 },
  "Montreal, QC": { lat: 45.5017, lng: -73.5673 },
  "London, UK": { lat: 51.5074, lng: -0.1278 },
  "Jerusalem, Israel": { lat: 31.7683, lng: 35.2137 },
  "Tel Aviv, Israel": { lat: 32.0853, lng: 34.7818 },
};

const MapCenterUpdater = ({ products }: { products: GeocodedProduct[] }) => {
  const map = useMap();
  useEffect(() => {
    if (products.length > 0) {
      const bounds = L.latLngBounds(products.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [products, map]);
  return null;
};

export const MapView: React.FC<MapViewProps> = ({ products }) => {
  const [geocodedProducts, setGeocodedProducts] = useState<GeocodedProduct[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);

  useEffect(() => {
    const geocodeAll = async () => {
      setIsGeocoding(true);
      const results: GeocodedProduct[] = [];
      
      for (const product of products) {
        if (!product.location) continue;

        // Check cache first
        if (geocodeCache[product.location]) {
          results.push({ ...product, ...geocodeCache[product.location] });
          continue;
        }

        // Try to geocode using Nominatim (free, but slow and has limits)
        try {
          // Add a small delay to respect Nominatim rate limits (1 req/sec)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(product.location)}&limit=1`);
          const data = await response.json();
          
          if (data && data.length > 0) {
            const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            geocodeCache[product.location] = coords;
            results.push({ ...product, ...coords });
          }
        } catch (error) {
          console.error(`Failed to geocode ${product.location}:`, error);
        }

        // Only geocode first 15 to avoid hitting limits too hard in this demo
        if (results.length >= 15) break;
      }
      
      setGeocodedProducts(results);
      setIsGeocoding(false);
    };

    geocodeAll();
  }, [products]);

  return (
    <div className="h-[600px] w-full rounded-3xl overflow-hidden border-4 border-white shadow-2xl relative">
      {isGeocoding && (
        <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-brand-primary font-bold text-sm">
          <MapPin className="w-4 h-4 animate-bounce" />
          Geocoding locations...
        </div>
      )}
      <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {geocodedProducts.map((product) => (
          <Marker key={product.agencyUniqueId} position={[product.lat, product.lng]}>
            <Popup className="custom-popup">
              <div className="p-1 min-w-[200px]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-brand-primary/10 rounded-lg text-brand-primary">
                    <Package className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {product.symbol || 'OU'}
                  </span>
                </div>
                <h4 className="font-bold text-stone-900 text-sm mb-1">{product.productName}</h4>
                <div className="flex items-center gap-1.5 text-stone-500 text-xs mb-2">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{product.company}</span>
                </div>
                <div className="flex flex-col gap-1 border-t border-stone-100 pt-2 mt-2">
                  <div className="flex items-center gap-1.5 text-stone-400 text-[10px]">
                    <MapPin className="w-3 h-3" />
                    <span>{product.location}</span>
                  </div>
                  {product.website && (
                    <a 
                      href={product.website.startsWith('http') ? product.website : `https://${product.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-brand-primary text-[10px] hover:underline"
                    >
                      <Globe className="w-3 h-3" />
                      <span>{product.website}</span>
                    </a>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        <MapCenterUpdater products={geocodedProducts} />
      </MapContainer>
    </div>
  );
};
