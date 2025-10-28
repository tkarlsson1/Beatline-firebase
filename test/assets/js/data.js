// assets/js/data.js
// Data helpers: merging track pools, year filters etc. Placeholder for now.
export function buildYearRange(min=1970, max=new Date().getFullYear()){
  const years = [];
  for(let y=min; y<=max; y++) years.push(y);
  return years;
}
