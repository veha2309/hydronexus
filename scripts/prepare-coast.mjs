import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
const topology = JSON.parse(
  readFileSync('node_modules/world-atlas/countries-110m.json', 'utf8'),
);
const countries = feature(topology, topology.objects.countries);
writeFileSync('public/coastlines.json', JSON.stringify(countries));
