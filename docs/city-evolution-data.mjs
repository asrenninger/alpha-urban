export const CONTINENTS = {
  Africa: '#e64b4b',
  America: '#294976',
  Asia: '#8c508d',
  Europe: '#4d9372',
  Oceania: '#d99b32',
};

export const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
export const smooth = value => {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
};
export const mix = (a, b, progress) => a + (b - a) * progress;

export function rotate(point, angle = 0.52) {
  const x = point[0] * Math.cos(angle) + point[2] * Math.sin(angle);
  const z = -point[0] * Math.sin(angle) + point[2] * Math.cos(angle);
  return [
    x,
    point[1] * Math.cos(-0.3) - z * Math.sin(-0.3),
    point[1] * Math.sin(-0.3) + z * Math.cos(-0.3),
  ];
}

export function cityLayouts(cities, year = 2024) {
  const residuals = cities.filter(city => city.residual !== null).map(city => city.residual);
  const yMin = Math.floor(Math.min(...residuals) / 25) * 25;
  const yMax = Math.ceil(Math.max(...residuals) / 25) * 25;
  const maxPath = Math.ceil(Math.max(...cities.flatMap(city => city.path.flat().map(Math.abs))) / 5) * 5;
  const yearIndex = clamp(year - 2017, 0, 7);
  const yearA = Math.floor(yearIndex);
  const yearB = Math.min(7, yearA + 1);
  const fraction = yearIndex - yearA;
  let missing = 0;

  const globe = cities.map(city => {
    const point = rotate(city.globe);
    return [0.5 + 0.40 * point[0], 0.49 - 0.40 * point[1], point[2] < 0 ? 0.32 : 0.85];
  });
  const hdi = cities.map(city => city.hdi === null
    ? [0.15 + missing++ * 0.027, 0.925, 0.45]
    : [
        0.12 + 0.79 * (city.hdi - 0.35) / 0.65,
        0.83 - 0.70 * (city.residual - yMin) / (yMax - yMin),
        0.65,
      ]);
  const time = cities.map(city => [
    0.52 + 0.37 * mix(city.path[yearA][0], city.path[yearB][0], fraction) / maxPath,
    0.47 - 0.37 * mix(city.path[yearA][1], city.path[yearB][1], fraction) / maxPath,
    0.58,
  ]);
  return {globe, hdi, time, yMin, yMax, maxPath};
}

export async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load data (${response.status}).`);
  return response.json();
}
