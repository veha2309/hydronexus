export type SourceAccess =
  | 'active'
  | 'public'
  | 'visualization-only'
  | 'registration-required'
  | 'restricted'
  | 'future-adapter';

export type DataSourceDescriptor = {
  id: string;
  name: string;
  provider: string;
  category: 'forecast' | 'observation' | 'satellite' | 'analysis' | 'bulletin';
  variables: string[];
  access: SourceAccess;
  cadence: string;
  endpoint?: string;
  publicSituation: boolean;
  notes: string;
};

export const DATA_SOURCES: readonly DataSourceDescriptor[] = [
  {
    id: 'incois-argo',
    name: 'Indian Argo Floats',
    provider: 'INCOIS',
    category: 'observation',
    variables: ['temperature', 'salinity', 'pressure', 'quality flags'],
    access: 'active',
    cadence: 'Near real time',
    endpoint: 'https://erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats',
    publicSituation: true,
    notes: 'Use adjusted values and provider QC flags where available.',
  },
  {
    id: 'rsmc-hycom',
    name: 'RSMC HYCOM',
    provider: 'INCOIS',
    category: 'forecast',
    variables: ['temperature', 'salinity', 'currents', 'ocean state'],
    access: 'active',
    cadence: 'Operational cycle',
    endpoint: 'https://incois.gov.in/oceanservices/rsmc_download.jsp',
    publicSituation: true,
    notes: 'Cycle files require discovery, validation and bounded subsetting.',
  },
  {
    id: 'rsmc-ww3',
    name: 'RSMC WaveWatch III',
    provider: 'INCOIS',
    category: 'forecast',
    variables: ['significant wave height', 'period', 'direction', 'swell'],
    access: 'active',
    cadence: 'Operational cycle',
    endpoint: 'https://incois.gov.in/oceanservices/rsmc_download.jsp',
    publicSituation: true,
    notes: 'Primary wave and coastal-exposure forecast source.',
  },
  {
    id: 'itewc-bulletins',
    name: 'Indian Tsunami Early Warning bulletins',
    provider: 'INCOIS / ITEWC',
    category: 'bulletin',
    variables: ['earthquake event', 'official bulletin', 'threat status'],
    access: 'active',
    cadence: 'Event driven',
    endpoint: 'https://tsunami.incois.gov.in/',
    publicSituation: true,
    notes: 'Official products remain visually and semantically distinct.',
  },
  ...[
    ['drifting-buoy', 'Drifting Buoys', 'observation'],
    ['noaa-hr-sst', 'NOAA High-resolution SST', 'satellite'],
    ['avhrr-sst', 'AVHRR SST', 'satellite'],
    ['ocean-state-forecast', 'Ocean State Forecast', 'forecast'],
    ['viirs', 'VIIRS SST and Chlorophyll', 'satellite'],
    ['modis', 'MODIS Chlorophyll', 'satellite'],
    ['nio-climatology', 'NIO Global Climatology', 'analysis'],
    ['ocean-reanalysis', 'GODAS-MOM Ocean Reanalysis', 'analysis'],
    ['argo-gridded', 'Argo Gridded Products', 'analysis'],
    ['ascat', 'ASCAT Winds', 'satellite'],
    ['quikscat', 'QuikSCAT', 'satellite'],
    ['amsre', 'AMSR-E', 'satellite'],
    ['tmi', 'TMI', 'satellite'],
    ['current-meter-array', 'Current Meter Array', 'observation'],
    ['roms', 'ROMS', 'forecast'],
    ['mike', 'MIKE Waves', 'forecast'],
    ['pfz', 'Potential Fishing Zone Advisories', 'analysis'],
    ['ocm1', 'OCM-1 Derived Products', 'satellite'],
    ['bloom-index', 'Bloom Indices', 'analysis'],
    ['cdom', 'CDOM Index', 'satellite'],
    ['avhrr-ground', 'INCOIS Ground-station AVHRR', 'satellite'],
  ].map(([id, name, category]) => ({
    id,
    name,
    provider: 'INCOIS',
    category: category as DataSourceDescriptor['category'],
    variables: [],
    access: 'future-adapter' as const,
    cadence: 'Source dependent',
    publicSituation: false,
    notes: 'Catalogued for a versioned adapter and access review.',
  })),
  ...[
    ['hf-radar', 'HF Radar', 'registration-required'],
    ['moored-buoy', 'Moored Buoys', 'visualization-only'],
    ['wave-rider', 'Wave Rider Buoys', 'visualization-only'],
    ['tsunami-buoy', 'Tsunami Buoys', 'visualization-only'],
    ['bpr', 'Bottom Pressure Recorders', 'visualization-only'],
    ['tide-gauge', 'Tide Gauges', 'visualization-only'],
    ['xbt-xctd', 'XBT/XCTD', 'visualization-only'],
    ['coastal-adcp', 'Coastal ADCP', 'future-adapter'],
    ['ship-observations', 'Ship Observations', 'future-adapter'],
    ['medas', 'MEDAS', 'restricted'],
    ['ocm2', 'OCM-2', 'restricted'],
    ['satcore', 'SATCORE', 'future-adapter'],
    ['comaps', 'COMAPS', 'future-adapter'],
    ['icmam', 'ICMAM', 'future-adapter'],
    ['ctcz', 'CTCZ', 'restricted'],
    ['omm', 'OMM', 'future-adapter'],
    ['research-cruises', 'Research Cruise Archives', 'future-adapter'],
  ].map(([id, name, access]) => ({
    id,
    name,
    provider: 'INCOIS',
    category: 'observation' as const,
    variables: [],
    access: access as SourceAccess,
    cadence: 'Source dependent',
    publicSituation: false,
    notes: 'Disabled until legitimate machine access and permissions exist.',
  })),
] as const;
