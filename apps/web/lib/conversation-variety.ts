/**
 * Generates a randomized "variety seed" injected into the planning prompt
 * so that conversations without a user prompt feel unique every time.
 */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

// Conversation topic pools — niche, specific, interesting
const TOPICS = [
  // Daily life but specific
  'Your most controversial food opinion',
  'A hobby you recently picked up and are terrible at',
  'The weirdest thing that happened to you this week',
  'Planning a spontaneous weekend trip somewhere nearby',
  'Debating whether a hot dog is a sandwich',
  'Your guilty pleasure TV show or movie',
  'The best meal you ever had and why',
  'A skill you wish you had learned as a kid',
  'Your morning routine and why it works (or doesn\'t)',
  'The last thing that made you laugh until you cried',

  // Culture & society
  'Why certain superstitions exist in different cultures',
  'The unwritten social rules that confuse foreigners',
  'How festivals and holidays differ across countries',
  'Street food culture and hidden gems in your city',
  'The etiquette of gift-giving in different cultures',
  'How humor translates (or doesn\'t) across languages',
  'Generational differences in how people communicate',
  'The concept of personal space in different countries',

  // Opinions & light debate
  'Is it better to be a morning person or a night owl?',
  'The best season and why everyone else is wrong',
  'Overrated vs underrated tourist destinations',
  'Whether remote work or office work is better',
  'The best age to be and why',
  'Whether cooking at home or eating out is better',
  'Is social media making us more or less connected?',
  'The one thing you would change about your city',

  // Storytelling & imagination
  'If you could live in any era of history, which one?',
  'The most interesting stranger you ever met',
  'A time you got completely lost somewhere',
  'Your dream house and where it would be',
  'The funniest misunderstanding you\'ve had in another language',
  'If you could have dinner with any person, living or dead',
  'A childhood memory that shaped who you are',
  'The bravest thing you ever did',

  // Niche & deep
  'Why do certain songs get stuck in your head?',
  'The psychology behind why we procrastinate',
  'What makes a neighborhood feel like home?',
  'How your taste in music has changed over the years',
  'The appeal of collecting things (stamps, records, etc.)',
  'Why do people watch the same movie over and over?',
  'The difference between being alone and being lonely',
  'What you\'d do if you had a free year with no obligations',
  'The small everyday things that actually make life good',
  'How you decide whether to trust someone',
]

const PERSONAS = [
  { relationship: 'old college friend you haven\'t seen in years', personality: 'nostalgic and warm, loves catching up' },
  { relationship: 'opinionated coworker on lunch break', personality: 'has strong takes but is fun about it' },
  { relationship: 'chatty neighbor you bump into often', personality: 'curious, always has a story to share' },
  { relationship: 'your friend\'s cool older sibling', personality: 'laid-back, gives surprisingly good advice' },
  { relationship: 'travel buddy you met at a hostel', personality: 'adventurous, spontaneous, a bit chaotic' },
  { relationship: 'regular at your favorite café', personality: 'thoughtful, observant, dry sense of humor' },
  { relationship: 'enthusiastic classmate from language school', personality: 'supportive, eager, always practicing' },
  { relationship: 'your friend who is really into cooking', personality: 'passionate about food, loves sharing recipes' },
  { relationship: 'a friend who just came back from traveling abroad', personality: 'full of stories, a bit restless' },
  { relationship: 'your overly honest friend', personality: 'blunt but caring, tells it like it is' },
  { relationship: 'the friend who always has recommendations', personality: 'enthusiastic about sharing discoveries' },
  { relationship: 'a chill friend on a long train ride', personality: 'reflective, enjoys deep talks when they happen naturally' },
]

const TONES = [
  'lighthearted and playful',
  'chill and relaxed',
  'warm and curious',
  'slightly teasing, friendly banter',
  'nostalgic and reflective',
  'enthusiastic and energetic',
  'thoughtful and meandering',
  'conspiratorial, sharing secrets',
]

const DYNAMICS = [
  'The learner just brought up the topic and you\'re both riffing on it',
  'You\'re telling the learner about something that happened to you',
  'You\'re both killing time waiting for something',
  'One of you just said something surprising and now you\'re unpacking it',
  'You\'re walking somewhere together and chatting',
  'You\'re both complaining about the same thing and bonding over it',
  'You just recommended something and are trying to convince them',
  'The learner asked for your opinion and you have a strong one',
]

const SETTINGS = [
  'texting on the phone late at night',
  'sitting at an izakaya after work',
  'walking through a park',
  'waiting in line somewhere',
  'on a train going somewhere',
  'at a coffee shop on a rainy day',
  'cooking together in a kitchen',
  'browsing a bookstore or record shop',
  'sitting on a rooftop in the evening',
  'at a street food stall',
]

export function getVarietySeed(): string {
  const topic = pick(TOPICS)
  const persona = pick(PERSONAS)
  const tone = pick(TONES)
  const dynamic = pick(DYNAMICS)
  const setting = pick(SETTINGS)
  const extraTopics = pickN(TOPICS.filter(t => t !== topic), 2)

  return `VARIETY SEED (use this to make the conversation unique — don't follow it rigidly, just let it inspire you):
- Suggested topic: "${topic}"
- Persona vibe: ${persona.relationship} — ${persona.personality}
- Tone: ${tone}
- Dynamic: ${dynamic}
- Setting: ${setting}
- Rabbit holes to explore if the conversation goes there: "${extraTopics[0]}", "${extraTopics[1]}"

IMPORTANT: Go DEEP on the topic. Don't stay surface-level. Ask follow-up questions, share opinions, react genuinely, go on tangents. Real conversations are messy and interesting — they don't stick to one shallow topic. If the learner engages, follow their energy and dig deeper. If something interesting comes up, chase it.`
}
