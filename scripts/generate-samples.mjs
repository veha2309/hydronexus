import { writeFileSync } from 'node:fs';
import { DEMO } from '../lib/ocean.ts';
const rows = [
  'id,kind,latitude,longitude,depth,time,temperature,salinity,speed,chlorophyll',
];
for (const o of DEMO.observations)
  for (const p of o.points)
    rows.push(
      [
        o.id,
        o.kind,
        p.latitude ?? o.latitude,
        p.longitude ?? o.longitude,
        p.depth,
        o.time,
        ...['temperature', 'salinity', 'speed', 'chlorophyll'].map((v) =>
          p.values[v].toFixed(5),
        ),
      ].join(','),
    );
writeFileSync('public/sample-observations.csv', rows.join('\n'));
