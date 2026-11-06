// Popular decks. Descriptions and win rates are from the app owner's list; card lists come from the published lists named in `list`.
// `cards` holds what can go on the stack. Lands never use the stack, so they are only listed for reference.
const UNTAPPED = { label: 'Untapped.gg', url: 'https://mtga.untapped.gg/constructed/standard/decks' };

export const DECKS = [
  {
    id: 'momo', short: 'Azorius Momo', name: 'Blue-White (Azorius) Momo / Flyers', color: 'sky', format: 'Standard', winRate: 'Win rate near 74% at competitive ranks',
    blurb: 'Low-cost flying creatures, bounce synergies and explosive buffs.',
    cards: [[4, 'Momo, Friendly Flier'], [4, 'Quantum Riddler'], [4, 'Sage of the Skies'], [4, 'Starfield Shepherd'], [2, 'Aang, Swift Savior'], [2, 'Cosmogrand Zenith'], [2, 'Haliya, Guided by Light'], [2, 'Nurturing Pixie'], [4, 'Springleaf Drum'], [2, 'Erode'], [4, 'Daydream'], [2, 'Practiced Offense'], [2, 'Seam Rip']],
    lands: [[7, 'Plains'], [4, 'Floodfarm Verge'], [4, 'Hallowed Fountain'], [4, 'Multiversal Passage'], [2, 'Abandoned Air Temple']],
    list: { label: 'Draftsim', date: 'May 2026', url: 'https://draftsim.com/decks/standard-azorius-momo/' },
    note: 'One Gran-Gran is left out because it is now banned in Standard.',
    sources: [{ label: 'YouTube', url: 'https://www.youtube.com/watch?v=1xWriTc5i_Y&t=28' }],
  },
  {
    id: 'auras', short: 'White Auras', name: 'Mono-White Auras', color: 'amber', format: 'Standard', winRate: 'Win rate around 58.6%',
    blurb: 'A reliable, budget-friendly aggro-enchantment strategy.',
    cards: [[4, 'Optimistic Scavenger'], [4, 'Ruin-Lurker Bat'], [4, 'Skyward Spider'], [4, 'Voice of Victory'], [4, 'Seam Rip'], [4, "Shardmage's Rescue"], [4, 'Ethereal Armor'], [4, 'Origin of Spider-Man'], [4, 'Sheltered by Ghosts'], [4, 'Feather of Flight']],
    lands: [[18, 'Plains'], [2, 'Abandoned Air Temple']],
    list: { label: 'Cards Realm', date: 'May 2026', url: 'https://mtg.cardsrealm.com/en-us/decks/kp2h-mono-white-auras' },
    sources: [UNTAPPED],
  },
  {
    id: 'reanimator', short: 'Reanimator', name: '4-Color / Sultai Reanimator', color: 'forest', format: 'Standard', winRate: null,
    blurb: 'Dumps heavy hitters into the graveyard early, then reanimates them ahead of curve for massive board pressure.',
    cards: [[4, 'Bringer of the Last Gift'], [4, 'Deceit'], [4, 'Formidable Speaker'], [4, 'Overlord of the Balemurk'], [4, 'Superior Spider-Man'], [4, 'Wistfulness'], [3, 'Ardyn, the Usurper'], [1, 'Terror of the Peaks'], [3, 'Bitter Triumph'], [4, 'Awaken the Honored Dead']],
    lands: [[4, 'Breeding Pool'], [4, 'Overgrown Tomb'], [4, 'Watery Grave'], [3, 'Wastewood Verge'], [2, 'Cavern of Souls'], [2, 'Gloomlake Verge'], [1, 'Ba Sing Se'], [1, 'Forest'], [1, 'Island'], [1, 'Swamp'], [1, 'Underground Mortuary'], [1, 'Willowrush Verge']],
    list: { label: 'Draftsim', date: 'May 2026', url: 'https://draftsim.com/decks/standard-4c-reanimator/' },
    sources: [UNTAPPED],
  },
  {
    id: 'burn', short: 'Red Burn', name: 'Mono-Red Burn / Prowess', color: 'crimson', format: 'Standard', winRate: null,
    blurb: 'Fast, low-to-the-ground aggression, ideal for quick ladder grinding in Best-of-One matches.',
    cards: [[4, 'Hearthborn Battler'], [4, 'Hired Claw'], [4, 'Nova Hellkite'], [4, 'Ojer Axonil, Deepest Might'], [4, 'Razorkin Needlehead'], [4, 'Scalding Viper'], [2, 'Fanatical Firebrand'], [1, 'Kellan, Planar Trailblazer'], [4, 'Burst Lightning'], [3, 'Shock'], [2, 'Sear'], [1, 'Lightning Strike']],
    lands: [[12, 'Mountain'], [4, 'Riverpyre Verge'], [4, 'Steam Vents'], [2, 'Spirebluff Canal'], [1, 'Soulstone Sanctuary']],
    list: { label: 'Draftsim', date: 'March 2026', url: 'https://draftsim.com/decks/standard-mono-red-aggro-78/' },
    sources: [{ label: 'Reddit', url: 'https://www.reddit.com/r/magicTCG/comments/1cs4dva/the_best_decks_in_standard_mtg_right_now/' }, UNTAPPED],
  },
];
export const deckById = id => DECKS.find(d => d.id === id);
