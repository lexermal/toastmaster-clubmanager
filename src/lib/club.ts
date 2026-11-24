/** Everything club-specific that is not synced from easy-Speak. Edit here to rebrand. */
export const CLUB = {
  name: 'Malmö Toastmasters',
  shortName: 'Malmö TM',
  tagline: 'Find your voice by the Öresund.',
  city: 'Malmö',
  timezone: 'Europe/Stockholm',
  founded: 2009,
  clubNumber: '01519351',
  district: 'District 107',
  language: 'English',
  schedule: 'Every second Monday (even weeks), 17:45–19:45',
  venue: {
    name: 'Studieförbundet Vuxenskolan',
    address: 'Malmö city centre',
    mapsUrl: 'https://maps.google.com/?q=Studieförbundet+Vuxenskolan+Malmö',
  },
  email: 'malmotoastmasters@protonmail.com',
  links: {
    toastmastersOrg: 'https://www.toastmasters.org/Find-a-Club/01519351-malmö-toastmasters',
    meetup: 'https://www.meetup.com/dk_se-toastmasters/',
    instagram: '',
    linkedin: '',
  },
  fees: [
    { label: 'Toastmasters International (6 months)', value: 'USD 60' },
    { label: 'One-time new member fee', value: 'USD 20' },
    { label: 'Club dues (6 months)', value: 'SEK 300' },
  ],
  feesNote: 'Fees are indicative — ask the treasurer for the current amounts.',
} as const;

export const PUBLIC_URL = (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, '');
