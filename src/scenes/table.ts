// The kitchen table at home, seen from above: three places (you, Lotte, Inge) that grow barer
// as the household runs down. Decorative; the kitchen line under it says the same in words.

export type TableLevel = 'high' | 'mid' | 'low';

const C = {
  wood: '#5b4430',
  grain: '#4a3726',
  plate: '#e6dac0',
  rim: '#b9a682',
  potato: '#c9a25a',
  potatoEdge: '#9c7a3c',
  bread: '#a86f35',
  breadTop: '#c58a4a',
  thinSoup: '#b98e52',
};

const SEATS = [70, 180, 290];

const plate = (x: number) =>
  `<ellipse cx="${x}" cy="66" rx="36" ry="15" fill="${C.plate}" stroke="${C.rim}" stroke-width="2"/>` +
  `<ellipse cx="${x}" cy="66" rx="24" ry="9" fill="none" stroke="${C.rim}" stroke-width="1"/>`;

const potatoes = (x: number, n: number) =>
  [
    [-11, -1],
    [5, -3],
    [-2, 4],
  ]
    .slice(0, n)
    .map(
      ([dx, dy]) =>
        `<ellipse cx="${x + dx}" cy="${66 + dy}" rx="8" ry="5" fill="${C.potato}" stroke="${C.potatoEdge}" stroke-width="1"/>`,
    )
    .join('');

const bowl = (x: number, soup: string | null) =>
  `<ellipse cx="${x}" cy="66" rx="26" ry="12" fill="${C.plate}" stroke="${C.rim}" stroke-width="2"/>` +
  (soup ? `<ellipse cx="${x}" cy="66" rx="19" ry="8" fill="${soup}"/>` : '');

const loaf = (x: number, y: number) =>
  `<ellipse cx="${x}" cy="${y}" rx="30" ry="12" fill="${C.bread}"/>` +
  `<ellipse cx="${x}" cy="${y - 2}" rx="26" ry="8" fill="${C.breadTop}"/>` +
  [-12, 0, 12].map((dx) => `<path d="M${x + dx - 4} ${y - 7} q4 5 8 0" stroke="${C.bread}" stroke-width="1.5" fill="none"/>`).join('');

const heel = (x: number, y: number) =>
  `<path d="M${x - 12} ${y + 4} a12 9 0 0 1 24 0 z" fill="${C.bread}"/><path d="M${x - 9} ${y + 3} a9 6 0 0 1 18 0 z" fill="${C.breadTop}"/>`;

const crumbs = (x: number, y: number) =>
  [
    [0, 0],
    [9, 4],
    [-7, 6],
    [15, -2],
  ]
    .map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="1.6" fill="${C.breadTop}"/>`)
    .join('');

/**
 * `fed`: whether food is being paid for tonight. When it isn't, Lotte gives her plate to Inge:
 * only the last place has anything on it.
 */
export function tableSvg(level: TableLevel, fed: boolean): string {
  const grain = [22, 44, 92]
    .map((y) => `<path d="M14 ${y} q90 -4 180 0 t152 0" stroke="${C.grain}" stroke-width="1.5" fill="none"/>`)
    .join('');
  let items = '';
  if (level === 'high') {
    items = loaf(180, 24) + SEATS.map((x, i) => plate(x) + (fed || i === 2 ? potatoes(x, 3) : '')).join('');
  } else if (level === 'mid') {
    items = heel(180, 22) + SEATS.map((x, i) => bowl(x, fed || i === 2 ? C.thinSoup : null)).join('');
  } else {
    items = bowl(180, null) + crumbs(240, 40);
  }
  return `<svg viewBox="0 0 360 110" role="presentation" aria-hidden="true"><rect x="4" y="6" width="352" height="98" rx="8" fill="${C.wood}"/>${grain}${items}</svg>`;
}
