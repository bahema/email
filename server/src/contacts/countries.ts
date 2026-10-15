import { countries } from 'countries-list';
import type { CountryOption } from '@affiliate/shared';
import { HttpError } from '../http.js';

const names: Record<string, string> = { AF: 'Africa', AS: 'Asia', EU: 'Europe', NA: 'North America', SA: 'South America', OC: 'Oceania' };
export const countryOptions: CountryOption[] = Object.entries(countries).flatMap(([code, data]) => names[data.continent] ? [{ code, name: data.name, continent: names[data.continent]! }] : []).sort((a,b) => a.name.localeCompare(b.name));
export function countryInfo(code: string): CountryOption {
  const found = countryOptions.find(country => country.code === code.trim().toUpperCase());
  if (!found) throw new HttpError(400, 'INVALID_COUNTRY', 'Select a supported country');
  return found;
}
