// Popular decks, as supplied by the app's owner. Win rates come from the linked sources and go out of date.
const UNTAPPED = { label: 'Untapped.gg', url: 'https://mtga.untapped.gg/constructed/standard/decks' };

export const DECKS = [
  {
    name: 'Blue-White (Azorius) Momo / Flyers', color: 'sky', format: 'Standard', winRate: 'Win rate near 74% at competitive ranks',
    blurb: 'Low-cost flying creatures, bounce synergies and explosive buffs.',
    cards: ['Starfield Shepherd', 'Nurturing Pixie'],
    sources: [{ label: 'YouTube', url: 'https://www.youtube.com/watch?v=1xWriTc5i_Y&t=28' }],
  },
  {
    name: 'Mono-White Auras', color: 'amber', format: 'Standard', winRate: 'Win rate around 58.6%',
    blurb: 'A reliable, budget-friendly aggro-enchantment strategy.',
    cards: [],
    sources: [UNTAPPED],
  },
  {
    name: '4-Color / Sultai Reanimator', color: 'forest', format: 'Standard', winRate: null,
    blurb: 'Dumps heavy hitters into the graveyard early, then reanimates them ahead of curve for massive board pressure.',
    cards: [],
    sources: [UNTAPPED],
  },
  {
    name: 'Mono-Red Burn / Prowess', color: 'crimson', format: 'Standard', winRate: null,
    blurb: 'Fast, low-to-the-ground aggression, ideal for quick ladder grinding in Best-of-One matches.',
    cards: [],
    sources: [{ label: 'Reddit', url: 'https://www.reddit.com/r/magicTCG/comments/1cs4dva/the_best_decks_in_standard_mtg_right_now/' }, UNTAPPED],
  },
];
