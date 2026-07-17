// Name normalization + matching between the pool golfer list and ESPN's feed.

// Letters NFD does not decompose into base + diacritic (so we transliterate them).
const SPECIAL: Record<string, string> = {
  ø: 'o', æ: 'ae', œ: 'oe', ð: 'd', þ: 'th', ł: 'l', ß: 'ss', đ: 'd', ħ: 'h', ı: 'i',
};

/** Accent-fold + lowercase + strip non-alphanumerics. "Ludvig Åberg" -> "ludvigaberg". */
export function fold(name: string | null | undefined): string {
  if (name == null) return '';
  return String(name)
    .toLowerCase()
    .replace(/[øæœðþłßđħı]/g, (ch) => SPECIAL[ch] || ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '');
}

/** URL/id-safe slug. "J.J. Spaun" -> "jj-spaun". */
export function slug(name: string | null | undefined): string {
  if (name == null) return '';
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ESPN uses slightly different names than the pool sheet for a handful of players.
// Maps folded pool name -> folded ESPN name so live sync can find them.
export const NAME_ALIASES: Record<string, string> = {
  jordanlsmith: 'jordansmith',
  matthewmccarty: 'mattmccarty',
  johnkeefer: 'johnnykeefer',
  jaydentreyschaper: 'jaydenschaper',
  angelayorafanegas: 'angelayora',
  eugeniolopezchacarra: 'eugeniochacarra',
  nicolasechavarria: 'nicoechavarria',
  baardbjoernevikskogen: 'bardbjornevikskogen',
  // Louis Oosthuizen is not in the ESPN field (not playing) -> stays on sheet score.
};

/** Resolve a pool golfer's folded name to the key we should look up in an ESPN index. */
export function aliasFor(foldedPoolName: string): string {
  return NAME_ALIASES[foldedPoolName] || foldedPoolName;
}
