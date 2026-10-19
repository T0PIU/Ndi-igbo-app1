// Single source of truth for choices. Imported by the server (validation) and by the browser (forms).

export const PURPOSES = [
  { id: 'student',  label: 'I am a student',          hint: 'Campus maps, roommates, freshers guide' },
  { id: 'visitor',  label: 'I am visiting',           hint: 'Places to go, events, getting around' },
  { id: 'resident', label: 'I live here',             hint: 'Events, local businesses, neighbours' },
  { id: 'curious',  label: 'I want to learn about the state', hint: 'Culture, language, food and the environment' },
  { id: 'business', label: 'I run a business or organisation', hint: 'Advertise, post programs and notices' },
];

// People may choose not to share. 'other' covers every other group.
export const GROUPS = [
  { id: 'igbo',   label: 'Igbo' },
  { id: 'yoruba', label: 'Yoruba' },
  { id: 'hausa',  label: 'Hausa' },
  { id: 'other',  label: 'Another group' },
];

export const STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
  'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'Outside Nigeria',
];

export const SCHOOLS = ['IMSU', 'FUTO', 'AIFUE', 'KOMU', 'Other school'];
export const LEVELS = ['100L', '200L', '300L', '400L', '500L', 'Postgraduate'];

// q = what we ask Spotify when searching for playlists.
export const GENRES = [
  { id: 'afrobeats',     label: 'Afrobeats',            q: 'Afrobeats' },
  { id: 'afropop',       label: 'Afropop',              q: 'Afropop' },
  { id: 'afro-fusion',   label: 'Afro-fusion',          q: 'Afro fusion' },
  { id: 'amapiano',      label: 'Amapiano',             q: 'Amapiano' },
  { id: 'highlife',      label: 'Highlife',             q: 'Highlife' },
  { id: 'igbo-highlife', label: 'Igbo highlife',        q: 'Igbo highlife' },
  { id: 'igbo-gospel',   label: 'Igbo gospel',          q: 'Igbo gospel' },
  { id: 'naija-gospel',  label: 'Nigerian gospel',      q: 'Nigerian gospel' },
  { id: 'naija-hiphop',  label: 'Naija hip-hop',        q: 'Nigerian hip hop' },
  { id: 'afro-rnb',      label: 'Afro R&B',             q: 'Afro R&B' },
  { id: 'fuji-juju',     label: 'Fuji and Juju',        q: 'Fuji juju' },
  { id: 'hausa',         label: 'Hausa music',          q: 'Hausa music' },
  { id: 'dancehall',     label: 'Afro-dancehall',       q: 'Afro dancehall' },
  { id: 'chill',         label: 'Chill and instrumental', q: 'Afro chill' },
  { id: 'traditional',   label: 'Traditional Igbo (egwu)', q: 'Igbo traditional music' },
];
export const MAX_GENRES = 6;

export const EVENT_TYPES = [
  { id: 'church',  label: 'Church' },
  { id: 'bar',     label: 'Bar and lounge' },
  { id: 'school',  label: 'School' },
  { id: 'culture', label: 'Culture' },
  { id: 'other',   label: 'Other' },
];
export const BUSINESS_CATS = ['Food', 'Fashion', 'Hair and beauty', 'Tech and repair', 'Printing', 'Transport', 'Tutors', 'Accommodation', 'Other'];
export const HABITS = ['Quiet', 'Early riser', 'Night reader', 'Neat', 'Cooks', 'Religious', 'Music lover', 'Non-smoker'];
export const GENDERS = ['Female', 'Male', 'Prefer not to say'];
export const WANTS = ['Any roommate', 'Female roommate', 'Male roommate'];
export const ORG_TYPES = ['School office', 'Student union', 'Business', 'Church', 'Community group'];
export const REPORT_REASONS = ['Scam or fake', 'Offensive', 'Wrong or misleading', 'Spam', 'Other'];
