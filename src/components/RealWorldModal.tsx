/// <reference types="google.maps" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useApiIsLoaded,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Compass,
  Dices,
  Globe,
  Loader2,
  MapPin,
  Play,
  Route as RouteIcon,
  Search,
  X,
} from 'lucide-react';
import type { DifficultyTier, LevelConfig } from '../types/game';
import { TIER_LABELS } from '../game/difficulty';
import {
  computeRandomSegmentEndpoints,
  convertStreetPathToLabyrinth,
  pickRandomStreetSeed,
  type LatLngPoint,
} from '../game/realWorldMaze';

interface RealWorldModalProps {
  activeTier: DifficultyTier;
  onLaunchLevel: (level: LevelConfig) => void;
  onClose: () => void;
}

interface StreetPreviewState {
  streetName: string;
  cityLabel: string;
  origin: LatLngPoint;
  destination: LatLngPoint;
  path: LatLngPoint[];
  distanceMeters: number;
}

const MAPS_API_KEY = (
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? ''
).trim();

function extractLatLngArray(rawPoints: unknown[]): LatLngPoint[] {
  const out: LatLngPoint[] = [];
  for (const pt of rawPoints) {
    if (!pt || typeof pt !== 'object') continue;
    const candidate = pt as {
      lat?: number | (() => number);
      lng?: number | (() => number);
    };
    const lat =
      typeof candidate.lat === 'function' ? candidate.lat() : candidate.lat;
    const lng =
      typeof candidate.lng === 'function' ? candidate.lng() : candidate.lng;
    if (typeof lat === 'number' && typeof lng === 'number') {
      out.push({ lat, lng });
    }
  }
  return out;
}

function parseStreetFromGeocode(
  results: google.maps.GeocoderResult[] | null | undefined,
  fallbackCity: string,
): { streetName: string; cityLabel: string } {
  if (!results || results.length === 0) {
    return { streetName: fallbackCity, cityLabel: fallbackCity };
  }
  const first = results[0];
  const comps = first.address_components ?? [];
  const route = comps.find((c) => c.types.includes('route'))?.long_name;
  const locality =
    comps.find((c) => c.types.includes('locality'))?.long_name ??
    comps.find((c) => c.types.includes('administrative_area_level_1'))?.long_name ??
    fallbackCity;
  const country = comps.find((c) => c.types.includes('country'))?.long_name;

  const streetName = route || first.formatted_address?.split(',')[0] || fallbackCity;
  const cityLabel = country ? `${locality}, ${country}` : locality;
  return { streetName, cityLabel };
}

function useAutocompleteSuggestions(inputValue: string) {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = inputValue.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const res =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: trimmed,
            sessionToken: sessionTokenRef.current ?? undefined,
          });
        if (!cancelled) {
          setSuggestions(res.suggestions ?? []);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, inputValue]);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
  }, []);

  return { suggestions, isSearching, resetSession };
}

const RealWorldMapWorkspace: React.FC<{
  activeTier: DifficultyTier;
  onLaunchLevel: (level: LevelConfig) => void;
  onClose: () => void;
}> = ({ activeTier, onLaunchLevel, onClose }) => {
  const map = useMap();
  const isApiLoaded = useApiIsLoaded();
  const loadingStatus = useApiLoadingStatus();
  const routesLib = useMapsLibrary('routes');
  const placesLib = useMapsLibrary('places');
  const geocodingLib = useMapsLibrary('geocoding');

  const [initialSeed] = useState(() => pickRandomStreetSeed());
  const lastSeedIdRef = useRef<string>(initialSeed.id);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const autoInitializedRef = useRef(false);

  const [searchText, setSearchText] = useState('');
  const { suggestions, isSearching, resetSession } =
    useAutocompleteSuggestions(searchText);

  const [streetPreview, setStreetPreview] = useState<StreetPreviewState | null>(
    null,
  );
  const [isComputingRoute, setIsComputingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Clean up map polyline on unmount
  useEffect(() => {
    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, []);

  const drawPolylineAndBounds = useCallback(
    (path: LatLngPoint[], viewport?: google.maps.LatLngBounds | null) => {
      if (!map) return;
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
      if (path.length >= 2) {
        const line = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: '#10b981',
          strokeOpacity: 0.95,
          strokeWeight: 6,
          map,
        });
        polylineRef.current = line;
      }
      if (viewport) {
        map.fitBounds(viewport, 48);
      } else if (path.length >= 2) {
        const bounds = new google.maps.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 54);
      }
    },
    [map],
  );

  const buildStreetCourseAt = useCallback(
    async (
      center: LatLngPoint,
      fallbackLabel: string,
      overrideName?: string,
    ) => {
      if (!routesLib || !map) return;
      setIsComputingRoute(true);
      setRouteError(null);

      // Reverse geocode center for real street name if not already known
      let resolvedStreet = overrideName ?? fallbackLabel;
      let resolvedCity = fallbackLabel;
      if (geocodingLib && !overrideName) {
        try {
          const geocoder = new geocodingLib.Geocoder();
          const geoRes = await geocoder.geocode({ location: center });
          const parsed = parseStreetFromGeocode(geoRes.results, fallbackLabel);
          resolvedStreet = parsed.streetName;
          resolvedCity = parsed.cityLabel;
        } catch {
          // Keep fallback label silently if geocoder returns ZERO_RESULTS
        }
      }

      // Try up to 3 bearings so water/pedestrian offsets resolve to a drivable street
      const baseBearing = Math.random() * Math.PI * 2;
      const bearings = [baseBearing, baseBearing + 1.57, baseBearing + 3.14];

      for (const bearing of bearings) {
        const { origin, destination } = computeRandomSegmentEndpoints(
          center,
          bearing,
          145,
        );
        try {
          const routeService = routesLib.Route as unknown as {
            computeRoutes: (req: {
              origin: LatLngPoint;
              destination: LatLngPoint;
              travelMode: string;
              fields: string[];
            }) => Promise<{
              routes?: Array<{
                path?: unknown[];
                distanceMeters?: number;
                viewport?: google.maps.LatLngBounds;
                createPolylines?: () => google.maps.Polyline[];
              }>;
            }>;
          };

          const response = await routeService.computeRoutes({
            origin,
            destination,
            travelMode: 'DRIVING',
            fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
          });

          const primary = response.routes?.[0];
          if (!primary) continue;

          let pathPts = Array.isArray(primary.path)
            ? extractLatLngArray(primary.path)
            : [];

          if (pathPts.length < 2 && typeof primary.createPolylines === 'function') {
            const tempPolys = primary.createPolylines();
            if (tempPolys.length > 0) {
              const rawArr = tempPolys[0].getPath().getArray();
              pathPts = extractLatLngArray(rawArr);
              tempPolys.forEach((p) => p.setMap(null));
            }
          }

          if (pathPts.length >= 2) {
            const startPt = pathPts[0];
            const endPt = pathPts[pathPts.length - 1];
            drawPolylineAndBounds(pathPts, primary.viewport);
            setStreetPreview({
              streetName: resolvedStreet,
              cityLabel: resolvedCity,
              origin: startPt,
              destination: endPt,
              path: pathPts,
              distanceMeters: Math.round(primary.distanceMeters ?? 145),
            });
            setIsComputingRoute(false);
            return;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Continue trying next bearing unless API auth error
          if (/denied|key|billing|quota/i.test(msg)) {
            setRouteError(
              'Google Maps Routes API isteği reddedildi. API anahtarınızın Routes ve Places yetkilerini kontrol edin.',
            );
            setIsComputingRoute(false);
            return;
          }
        }
      }

      setRouteError(
        'Bu noktada araç yolu bulunamadı. Haritada başka bir sokağa tıklayın veya Rastgele Sokak Seç butonunu kullanın.',
      );
      setIsComputingRoute(false);
    },
    [drawPolylineAndBounds, geocodingLib, map, routesLib],
  );

  // Trigger initial random real-world street once libraries & map are ready
  useEffect(() => {
    if (!isApiLoaded || !routesLib || !map || autoInitializedRef.current) return;
    autoInitializedRef.current = true;
    void buildStreetCourseAt(
      { lat: initialSeed.lat, lng: initialSeed.lng },
      initialSeed.cityLabel,
    );
  }, [buildStreetCourseAt, initialSeed, isApiLoaded, map, routesLib]);

  const handleRandomStreet = useCallback(() => {
    const seed = pickRandomStreetSeed(lastSeedIdRef.current);
    lastSeedIdRef.current = seed.id;
    setSearchText('');
    resetSession();
    void buildStreetCourseAt({ lat: seed.lat, lng: seed.lng }, seed.cityLabel);
  }, [buildStreetCourseAt, resetSession]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['location', 'viewport', 'formattedAddress', 'displayName'],
        });
        resetSession();
        const loc = place.location;
        if (!loc) return;
        const coords = { lat: loc.lat(), lng: loc.lng() };
        const streetLabel =
          place.displayName ||
          place.formattedAddress?.split(',')[0] ||
          'Seçili Sokak';
        const cityLabel = place.formattedAddress || streetLabel;
        setSearchText(streetLabel);
        void buildStreetCourseAt(coords, cityLabel, streetLabel);
      } catch {
        setRouteError('Seçilen konumun ayrıntıları alınamadı.');
      }
    },
    [buildStreetCourseAt, placesLib, resetSession],
  );

  const generatedPreviewMaze = useMemo(() => {
    if (!streetPreview) return null;
    return convertStreetPathToLabyrinth({
      path: streetPreview.path,
      meta: {
        streetName: streetPreview.streetName,
        cityLabel: streetPreview.cityLabel,
        origin: streetPreview.origin,
        destination: streetPreview.destination,
        distanceMeters: streetPreview.distanceMeters,
      },
      tier: activeTier,
    });
  }, [activeTier, streetPreview]);

  const authFailed =
    loadingStatus === APILoadingStatus.AUTH_FAILURE ||
    loadingStatus === APILoadingStatus.FAILED;

  return (
    <div className="flex flex-col gap-3.5 p-4 md:p-5 overflow-y-auto">
      {/* Top Controls: Place Autocomplete + Random Street Generator */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Dünyadan bir sokak veya mahalle ara (ör. Bağdat Caddesi, Shibuya)..."
            aria-label="Gerçek dünya sokağı ara"
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-emerald-400 outline-none text-sm text-white placeholder:text-slate-500"
          />
          {isSearching && (
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
          )}

          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#0d1526] border border-slate-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-800">
              {suggestions.map((s, idx) => (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => void handleSelectSuggestion(s)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-slate-800/90 text-xs md:text-sm text-slate-100 flex items-center gap-2.5 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">{s.placePrediction?.text.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={handleRandomStreet}
          disabled={isComputingRoute || !isApiLoaded}
          className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors"
        >
          <Dices className="w-4 h-4" />
          <span>Rastgele Sokak Seç</span>
        </button>
      </div>

      {/* Interactive Google Map Viewport (Explicit CSS height required) */}
      <div className="relative w-full h-[300px] md:h-[350px] rounded-xl overflow-hidden border border-slate-700/90 bg-slate-950">
        {authFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
            <div className="text-sm font-bold text-white">
              Google Maps Yüklenemedi
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              API anahtarı doğrulaması başarısız oldu veya Maps JavaScript API etkinleştirilmedi.
            </p>
          </div>
        ) : (
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={{ lat: initialSeed.lat, lng: initialSeed.lng }}
            defaultZoom={17}
            gestureHandling="greedy"
            mapTypeControl={false}
            streetViewControl={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            onClick={(ev) => {
              const latLng = ev.detail.latLng;
              if (latLng) {
                void buildStreetCourseAt(
                  { lat: latLng.lat, lng: latLng.lng },
                  'Harita Seçimi',
                );
              }
            }}
            style={{ width: '100%', height: '100%' }}
          >
            {streetPreview && (
              <>
                <AdvancedMarker
                  position={streetPreview.origin}
                  title="Başlangıç Noktası (A)"
                >
                  <Pin
                    background="#06b6d4"
                    borderColor="#cffafe"
                    glyphColor="#082f49"
                    glyph="A"
                  />
                </AdvancedMarker>
                <AdvancedMarker
                  position={streetPreview.destination}
                  title="Park Hedefi (P)"
                >
                  <Pin
                    background="#10b981"
                    borderColor="#d1fae5"
                    glyphColor="#022c22"
                    glyph="P"
                  />
                </AdvancedMarker>
              </>
            )}
          </GoogleMap>
        )}

        {isComputingRoute && (
          <div className="absolute top-3 left-3 bg-[#0b111e]/95 border border-emerald-500/50 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-emerald-300 font-semibold pointer-events-none">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Sokak rotası 3D labirente dönüştürülüyor...</span>
          </div>
        )}
      </div>

      {routeError && (
        <div className="rounded-xl bg-amber-500/15 border border-amber-500/40 px-3.5 py-2.5 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{routeError}</span>
        </div>
      )}

      {/* Converted 3D Labyrinth Preview Stats + Launch CTA */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
            <RouteIcon className="w-3.5 h-3.5" />
            <span>
              DÖNÜŞTÜRÜLEN 3D PARKUR · {TIER_LABELS[activeTier]}
            </span>
          </div>
          <div className="text-base font-bold text-white truncate mt-0.5">
            {streetPreview?.streetName ?? 'Sokak Seçiliyor...'}
          </div>
          <div className="text-xs text-slate-400 truncate">
            {streetPreview
              ? `${streetPreview.cityLabel} · ${streetPreview.distanceMeters}m gerçek rota · ${
                  generatedPreviewMaze?.shortestPathCells ?? 0
                } koridor hücresi · ${generatedPreviewMaze?.movingGates.length ?? 0} hareketli bariyer`
              : 'Haritada herhangi bir sokağa tıklayın veya Rastgele Sokak Seç butonuna basın.'}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!generatedPreviewMaze || isComputingRoute}
            onClick={() => {
              if (generatedPreviewMaze) {
                onLaunchLevel(generatedPreviewMaze);
              }
            }}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-45 text-slate-950 font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>3D LABİRENTİ BAŞLAT</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const RealWorldModal: React.FC<RealWorldModalProps> = ({
  activeTier,
  onLaunchLevel,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-40 bg-[#050811]/84 flex items-center justify-center p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Gerçek Dünya Modu"
    >
      <div className="w-full max-w-4xl bg-[#0d1424] border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white leading-tight">
                Gerçek Dünya Modu
              </h2>
              <p className="text-[11px] text-slate-400">
                Google Maps API ile gerçek sokakları 3D labirent parkuruna dönüştür
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Gerçek Dünya Modunu Kapat"
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Live Google Maps Provider OR Clean Setup Guidance when API key not yet configured */}
        {MAPS_API_KEY ? (
          <APIProvider apiKey={MAPS_API_KEY} language="tr" region="TR">
            <RealWorldMapWorkspace
              activeTier={activeTier}
              onLaunchLevel={onLaunchLevel}
              onClose={onClose}
            />
          </APIProvider>
        ) : (
          <div className="p-6 md:p-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center mb-4">
              <Compass className="w-7 h-7 text-cyan-400" />
            </div>
            <h3 className="text-xl font-bold text-white">
              Google Maps Platform Anahtarı Gerekli
            </h3>
            <p className="text-sm text-slate-300 mt-2 max-w-lg leading-relaxed">
              Gerçek dünya sokaklarını aramak, haritada rastgele bir sokak seçmek ve
              Routes API ile 3D labirent parkuru üretmek için{' '}
              <code className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 text-xs">
                VITE_GOOGLE_MAPS_API_KEY
              </code>{' '}
              ortam değişkeninin tanımlanması gerekir.
            </p>
            <div className="mt-5 w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-left text-xs text-slate-400 space-y-1.5">
              <div className="font-bold text-slate-200">Etkinleştirme Adımları:</div>
              <div>1. AI Studio Google Maps kurulum penceresinden veya Proje Ayarlarından bir Google Maps API anahtarı bağlayın.</div>
              <div>2. Anahtar için Maps JavaScript API, Places API (New) ve Routes API servislerinin açık olduğundan emin olun.</div>
              <div>3. Sayfayı yenilediğinizde canlı harita, sokak arama ve Rastgele Sokak Seç özelliği otomatik olarak açılacaktır.</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm cursor-pointer"
            >
              Ana Menüye Dön
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
